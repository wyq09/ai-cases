/* ==========================================================================
   Hearth — pure logic (no DOM access; shared by the app and the node tests)
   ========================================================================== */

/** Markdown-ish → HTML: **bold**, `code`, bullet lists and numbered lists. */
function formatReply(text) {
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const inline = (s) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`(.+?)`/g, "<code>$1</code>");

  const lines = String(text).split("\n");
  let html = "";
  let inList = false;

  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = /^[•\-*]\s+/.test(line);
    const numbered = /^\d+\.\s+/.test(line);
    if (bullet || numbered) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${inline(line.replace(bullet ? /^[•\-*]\s+/ : /^\d+\.\s+/, ""))}</li>`;
      continue;
    }
    if (inList) {
      html += "</ul>";
      inList = false;
    }
    if (line.trim() !== "") html += `<p style="margin:0 0 8px">${inline(line)}</p>`;
  }
  if (inList) html += "</ul>";
  return html;
}

/** Pick the canned reply whose key best matches the prompt. */
function pickReply(prompt, replies) {
  const p = String(prompt || "").trim().toLowerCase();
  if (!p) return null;
  const keys = Object.keys(replies || {});
  const exact = keys.find((k) => k.toLowerCase() === p);
  if (exact) return replies[exact];
  const contains = keys.find((k) => p.includes(k.toLowerCase()) || k.toLowerCase().includes(p));
  if (contains) return replies[contains];
  return null;
}

/** Case-insensitive substring match used by the command palette. */
function matchesQuery(label, query) {
  if (!query) return true;
  return String(label).toLowerCase().includes(String(query).trim().toLowerCase());
}

/* ------------------------------ tasks ------------------------------ */

function filterTasks(tasks, col) {
  return (tasks || []).filter((t) => t.col === col);
}

function countByColumn(tasks, cols) {
  const out = {};
  (cols || []).forEach((c) => {
    out[typeof c === "string" ? c : c.id] = 0;
  });
  (tasks || []).forEach((t) => {
    if (out[t.col] === undefined) out[t.col] = 0;
    out[t.col] += 1;
  });
  return out;
}

/** Move a task between columns. Returns the task, or null when unknown. */
function moveTask(tasks, id, col) {
  const t = (tasks || []).find((x) => x.id === id);
  if (!t) return null;
  if (t.col === col) return t;
  t.col = col;
  return t;
}

function toggleTaskDone(tasks, id) {
  const t = (tasks || []).find((x) => x.id === id);
  if (!t) return null;
  t.done = !t.done;
  return t;
}

/** Build a new task record with sane defaults. */
function createTask(tasks, payload) {
  const id = payload.id || `t${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const task = {
    id,
    col: payload.col || "todo",
    title: String(payload.title || "Untitled task").trim(),
    desc: String(payload.desc || "").trim(),
    tags: Array.isArray(payload.tags) ? payload.tags.slice() : [],
    date: payload.date || "Feb 18",
    comments: payload.comments ?? 0,
    links: payload.links ?? 0,
    progress: Math.max(0, Math.min(100, Number(payload.progress) || 0)),
    assignees: payload.assignees && payload.assignees.length ? payload.assignees.slice() : ["RM"],
    done: false,
  };
  tasks.push(task);
  return task;
}

/** Split a 0–100 percentage into N lit segments (used by the file progress bar). */
function progressSegments(progress, count) {
  const lit = Math.round((Math.max(0, Math.min(100, progress)) / 100) * count);
  return Array.from({ length: count }, (_, i) => i < lit);
}

/* ------------------------------ files ------------------------------ */

function filterFiles(files, group) {
  if (!group || group === "All Files") return (files || []).slice();
  return (files || []).filter((f) => f.group === group);
}

function storageTotal(storage) {
  return (storage || []).reduce((a, b) => a + b.gb, 0);
}

/** Percentage width for every storage slice, plus the used/total label. */
function storageSegments(storage, total) {
  const sum = total || storageTotal(storage);
  return (storage || []).map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    gb: s.gb,
    pct: sum ? ((s.gb / sum) * 100).toFixed(1) : "0.0",
  }));
}

/* ------------------------------ goals ------------------------------ */

function filterGoals(goals, tab) {
  if (!tab || tab === "All Goals") return (goals || []).slice();
  return (goals || []).filter((g) => g.tag === tab);
}

/** Progress shown for a goal on the given week (W1 trails, W3 leads). */
function goalValueForWeek(goal, week) {
  const w = week || "W2";
  const base = Number(goal.value) || 0;
  if (w === "W1") return Math.round(base * 0.86);
  if (w === "W3") return Math.min(100, base + 6);
  return base;
}

function goalMetricForWeek(goal, week) {
  const w = week || "W2";
  const metric = String(goal.metric || "");
  return metric.replace(/^W\d\s+/, `${w} `);
}

function goalSeries(goal, week) {
  const weeks = goal.weeks || {};
  return weeks[week] || weeks.W1 || weeks.W2 || [];
}

/** Recount active goals per pillar. */
function pillarTotals(pillars, goals) {
  const count = {};
  (goals || []).forEach((g) => {
    count[g.tag] = (count[g.tag] || 0) + 1;
  });
  return (pillars || []).map((p) => ({
    ...p,
    count: count[p.name] ?? p.count,
    sub: `${count[p.name] ?? p.count} active goal${(count[p.name] ?? p.count) === 1 ? "" : "s"}`,
  }));
}

/* ------------------------------ misc ------------------------------ */

function greetingFor(date) {
  const d = date && typeof date.getHours === "function" ? date : new Date();
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function stripMarkdown(text) {
  return String(text || "").replace(/\*\*/g, "").replace(/`/g, "");
}

function clampPercent(n) {
  return Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
}
