#!/usr/bin/env node
/**
 * Hearth · Life OS — 逻辑层回归测试
 *
 * 直接加载 src/logic.js（与浏览器端共用同一份源码），零依赖。
 *   node test/run.mjs
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src");

let pass = 0;
const failures = [];

function ok(name, cond, detail = "") {
  if (cond) {
    pass += 1;
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function eq(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  ok(name, a === e, `expected ${e}, got ${a}`);
}

/* ------------------------------------------------------------------ */
/* load the shared logic module                                        */
/* ------------------------------------------------------------------ */

const source = await readFile(join(SRC, "logic.js"), "utf8");
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(source + "\n;globalThis.__api = {formatReply,pickReply,matchesQuery,filterTasks,countByColumn,moveTask,toggleTaskDone,createTask,progressSegments,filterFiles,storageTotal,storageSegments,filterGoals,goalValueForWeek,goalMetricForWeek,goalSeries,pillarTotals,greetingFor,stripMarkdown,clampPercent};", sandbox);
const L = sandbox.__api;

/* ------------------------------------------------------------------ */
/* formatReply — markdown-ish rendering                                */
/* ------------------------------------------------------------------ */

const plain = L.formatReply("just a line");
ok("formatReply plain paragraph", plain.includes("<p") && plain.includes("just a line"), plain);

const bold = L.formatReply("**Health** is fine");
ok("formatReply bold", bold.includes("<strong>Health</strong>"), bold);

const inline = L.formatReply("use `npm test` now");
ok("formatReply inline code", inline.includes("<code>npm test</code>"), inline);

const bullets = L.formatReply("• one\n• two\n• three");
ok("formatReply bullet list", (bullets.match(/<li>/g) || []).length === 3, bullets);
ok("formatReply bullet list closed", bullets.includes("</ul>"), bullets);

const numbered = L.formatReply("1. first\n2. second");
ok("formatReply numbered list", (numbered.match(/<li>/g) || []).length === 2, numbered);

const mixed = L.formatReply("Intro\n• a\nTail");
ok("formatReply list closes before trailing text", mixed.indexOf("</ul>") < mixed.indexOf("Tail"), mixed);

ok("formatReply escapes html", L.formatReply("<script>alert(1)</script>").includes("&lt;script&gt;"), "not escaped");

/* ------------------------------------------------------------------ */
/* pickReply / matchesQuery                                            */
/* ------------------------------------------------------------------ */

const replies = {
  "Plan my vacation": "VAC",
  "Help me move to NYC": "NYC",
  "Review my weekly goals": "GOALS",
};
eq("pickReply exact", L.pickReply("Plan my vacation", replies), "VAC");
eq("pickReply case-insensitive", L.pickReply("plan my VACATION", replies), "VAC");
eq("pickReply contains", L.pickReply("please plan my vacation soon", replies), "VAC");
eq("pickReply miss returns null", L.pickReply("something else entirely", replies), null);
eq("pickReply empty input", L.pickReply("", replies), null);

ok("matchesQuery empty query matches", L.matchesQuery("anything", ""));
ok("matchesQuery substring", L.matchesQuery("Review pull requests", "pull"));
ok("matchesQuery is case-insensitive", L.matchesQuery("Review pull requests", "PULL"));
ok("matchesQuery miss", !L.matchesQuery("Review pull requests", "zzz"));

/* ------------------------------------------------------------------ */
/* tasks                                                                */
/* ------------------------------------------------------------------ */

const tasks = [
  { id: "t1", col: "todo", title: "A", done: false, tags: [] },
  { id: "t2", col: "doing", title: "B", done: false, tags: [] },
  { id: "t3", col: "todo", title: "C", done: true, tags: [] },
];
eq("filterTasks todo", L.filterTasks(tasks, "todo").map((t) => t.id), ["t1", "t3"]);
eq("filterTasks doing", L.filterTasks(tasks, "doing").map((t) => t.id), ["t2"]);
eq("filterTasks unknown column", L.filterTasks(tasks, "nope"), []);

eq("countByColumn", L.countByColumn(tasks, ["todo", "doing", "waiting"]), { todo: 2, doing: 1, waiting: 0 });

const moved = L.moveTask(tasks, "t2", "waiting");
ok("moveTask relocates", moved && moved.col === "waiting" && tasks[1].col === "waiting", JSON.stringify(tasks[1]));
eq("moveTask to same column is a no-op", L.moveTask(tasks, "t1", "todo").col, "todo");
eq("moveTask unknown id", L.moveTask(tasks, "nope", "todo"), null);

const toggled = L.toggleTaskDone(tasks, "t1");
ok("toggleTaskDone flips", toggled.done === true, "not flipped");
L.toggleTaskDone(tasks, "t1");
ok("toggleTaskDone flips back", tasks[0].done === false);

const created = L.createTask(tasks, { title: "  New task  ", col: "doing", progress: 150 });
eq("createTask trims title", created.title, "New task");
eq("createTask clamps progress", created.progress, 100);
eq("createTask default assignee", created.assignees, ["RM"]);
eq("createTask starts not done", created.done, false);
ok("createTask appends", tasks[tasks.length - 1].id === created.id);

const defaulted = L.createTask(tasks, {});
eq("createTask default title", defaulted.title, "Untitled task");
eq("createTask default column", defaulted.col, "todo");

/* ------------------------------------------------------------------ */
/* files                                                                */
/* ------------------------------------------------------------------ */

const files = [
  { id: "f1", group: "Legal & Finance", name: "a.pdf" },
  { id: "f2", group: "Travel", name: "b.png" },
  { id: "f3", group: "Legal & Finance", name: "c.pdf" },
];
eq("filterFiles all", L.filterFiles(files, "All Files").length, 3);
eq("filterFiles group", L.filterFiles(files, "Legal & Finance").map((f) => f.id), ["f1", "f3"]);
eq("filterFiles other", L.filterFiles(files, "Travel").map((f) => f.id), ["f2"]);
ok("filterFiles returns a copy", L.filterFiles(files, "All Files") !== files);

const storage = [
  { id: "s1", name: "Documents", gb: 52, color: "#a" },
  { id: "s2", name: "Research", gb: 28, color: "#b" },
  { id: "s3", name: "Image", gb: 26, color: "#c" },
  { id: "s4", name: "Download", gb: 18, color: "#d" },
  { id: "s5", name: "Other", gb: 6, color: "#e" },
];
eq("storageTotal", L.storageTotal(storage), 130);
const segs = L.storageSegments(storage);
eq("storageSegments count", segs.length, 5);
eq("storageSegments first pct", segs[0].pct, "40.0");
eq("storageSegments last pct", segs[4].pct, "4.6");
ok("storageSegments pcts sum ≈ 100", Math.abs(segs.reduce((a, s) => a + Number(s.pct), 0) - 100) < 0.5);

const segs2 = L.storageSegments(storage, 200);
eq("storageSegments honours explicit total", segs2[0].pct, "26.0");

/* ------------------------------------------------------------------ */
/* goals                                                                */
/* ------------------------------------------------------------------ */

const goals = [
  { id: "g1", name: "Health", tag: "Health", value: 78, metric: "W2 Max Target", weeks: { W1: [1], W2: [2], W3: [3] } },
  { id: "g2", name: "Money", tag: "Career", value: 45, metric: "Portfolio Growth", weeks: { W1: [1], W2: [2], W3: [3] } },
  { id: "g3", name: "Habit", tag: "Growth", value: 20, metric: "Streak", weeks: { W1: [1], W2: [2], W3: [3] } },
];
eq("filterGoals all", L.filterGoals(goals, "All Goals").length, 3);
eq("filterGoals by tag", L.filterGoals(goals, "Health").map((g) => g.id), ["g1"]);
eq("filterGoals empty tag", L.filterGoals(goals, "Nope"), []);

eq("goalValueForWeek W1 trails", L.goalValueForWeek(goals[0], "W1"), 67);
eq("goalValueForWeek W2 is base", L.goalValueForWeek(goals[0], "W2"), 78);
eq("goalValueForWeek W3 leads", L.goalValueForWeek(goals[0], "W3"), 84);
eq("goalValueForWeek caps at 100", L.goalValueForWeek({ value: 99 }, "W3"), 100);
eq("goalValueForWeek defaults to W2", L.goalValueForWeek(goals[0]), 78);

eq("goalMetricForWeek rewrites prefix", L.goalMetricForWeek(goals[0], "W3"), "W3 Max Target");
eq("goalMetricForWeek keeps plain metric", L.goalMetricForWeek(goals[1], "W1"), "Portfolio Growth");
eq("goalSeries picks week", L.goalSeries(goals[0], "W3"), [3]);
eq("goalSeries falls back", L.goalSeries({ weeks: { W1: [9] } }, "W2"), [9]);

const pillars = [
  { id: "p1", name: "Health", count: 0 },
  { id: "p2", name: "Career", count: 0 },
  { id: "p3", name: "Growth", count: 0 },
];
const totals = L.pillarTotals(pillars, goals);
eq("pillarTotals counts goals", totals.map((p) => p.count), [1, 1, 1]);
eq("pillarTotals singular wording", totals[0].sub, "1 active goal");
eq("pillarTotals plural wording", totals[1].sub, "1 active goal");

const pillars2 = [
  { id: "p1", name: "Health", count: 0 },
  { id: "p2", name: "Career", count: 0 },
];
const g2 = [...goals, { id: "g4", name: "Health 2", tag: "Health", value: 10, metric: "m", weeks: {} }];
const totals2 = L.pillarTotals(pillars2, g2);
eq("pillarTotals plural form", totals2[0].sub, "2 active goals");

/* ------------------------------------------------------------------ */
/* misc                                                                 */
/* ------------------------------------------------------------------ */

eq("greetingFor morning", L.greetingFor(new Date("2026-02-18T09:00:00")), "Good morning");
eq("greetingFor afternoon", L.greetingFor(new Date("2026-02-18T14:00:00")), "Good afternoon");
eq("greetingFor evening", L.greetingFor(new Date("2026-02-18T21:00:00")), "Good evening");

eq("stripMarkdown", L.stripMarkdown("**bold** and `code`"), "bold and code");
eq("clampPercent low", L.clampPercent(-20), 0);
eq("clampPercent high", L.clampPercent(140), 100);
eq("clampPercent rounds", L.clampPercent(48.6), 49);

/* ------------------------------------------------------------------ */
/* progress segments                                                    */
/* ------------------------------------------------------------------ */

eq("progressSegments 100%", L.progressSegments(100, 14).filter(Boolean).length, 14);
eq("progressSegments 0%", L.progressSegments(0, 14).filter(Boolean).length, 0);
eq("progressSegments 50%", L.progressSegments(50, 14).filter(Boolean).length, 7);
eq("progressSegments clamps above 100", L.progressSegments(300, 14).filter(Boolean).length, 14);

/* ------------------------------------------------------------------ */
/* report                                                               */
/* ------------------------------------------------------------------ */

const total = pass + failures.length;
if (failures.length) {
  console.error(`\n✗ ${failures.length}/${total} 项失败：`);
  failures.forEach((f) => console.error(`  · ${f}`));
  process.exit(1);
}
console.log(`✓ 逻辑层回归 ${total} 项全绿`);
