/* ==========================================================================
   Hearth — Tasks view (smart / kanban / list)
   ========================================================================== */

function taskCardHtml(t) {
  const hasProgress = t.progress > 0;
  return `
  <article class="task-card" draggable="true" data-task="${t.id}" data-act="task-open" data-id="${t.id}" tabindex="0" role="button">
    <h5><span class="task-ico">${ic("tasks", 14)}</span>${esc(t.title)}</h5>
    ${t.desc ? `<p class="task-desc">${esc(t.desc)}</p>` : ""}
    ${hasProgress ? `<div class="prog-wrap"><div class="prog-track"><i style="width:${t.progress}%"></i></div><div class="prog-pct">${t.progress}%</div></div>` : ""}
    <div class="task-tags">
      ${(t.tags || []).map((tg) => `<span class="tag ${TONE_CLASS[tg.c] || "tag-violet"}">${esc(tg.t)}</span>`).join("")}
    </div>
    <div class="task-foot">
      <span class="tf">${ic("calendar", 11)} ${esc(t.date)}</span>
      <span class="tf">${ic("tasks", 11)} ${t.comments}</span>
      <span class="tf">${ic("link", 11)} ${t.links}</span>
      <span class="spacer"></span>
      <span class="avatar-pair">
        ${(t.assignees || [])
          .map((a, i) => `<span class="avatar avatar-sm" style="background:${i === 0 ? "var(--violet-soft)" : "var(--blue-soft)"};color:${i === 0 ? "var(--violet)" : "var(--blue)"};font-size:9px">${esc(a)}</span>`)
          .join("")}
      </span>
    </div>
  </article>`;
}

function kanbanHtml() {
  return `
  <div class="kanban" id="kanban">
    ${TASK_COLUMNS.map((col) => {
      const items = filterTasks(state.tasks, col.id);
      return `
      <section class="kcol" data-col="${col.id}">
        <header class="kcol-head">
          ${ic(col.icon, 15)}
          <span>${esc(col.name)}</span>
          <span class="kcol-count">${items.length}</span>
          <span class="kcol-tools">
            <button data-act="col-add" data-col="${col.id}" aria-label="Add task to ${esc(col.name)}">${ic("plus", 15)}</button>
            <button data-act="col-menu" data-col="${col.id}" aria-label="Column options">${ic("dotsV", 15)}</button>
          </span>
        </header>
        <div class="kcol-list" data-col="${col.id}">
          ${items.map(taskCardHtml).join("")}
        </div>
        <button class="add-task" data-act="col-add" data-col="${col.id}">${ic("plus", 13)} Add task</button>
      </section>`;
    }).join("")}
  </div>`;
}

function listHtml() {
  const rows = state.tasks
    .map(
      (t) => `<div class="list-row" data-act="task-open" data-id="${t.id}" data-task="${t.id}" tabindex="0" role="button">
        <span class="check ${t.done ? "is-done" : ""}" data-act="task-toggle" data-id="${t.id}" aria-label="Toggle done">${t.done ? ic("check", 11) : ""}</span>
        <span class="lr-title">${esc(t.title)}</span>
        <span class="lr-hide">${TASK_COLUMNS.find((c) => c.id === t.col).name}</span>
        <span class="lr-hide">${esc(t.date)}</span>
        <span class="lr-hide">${(t.tags || []).map((tg) => `<span class="tag ${TONE_CLASS[tg.c] || "tag-violet"}">${esc(tg.t)}</span>`).join(" ")}</span>
        <span class="avatar-pair">${(t.assignees || []).map((a, i) => `<span class="avatar avatar-sm" style="background:${i === 0 ? "var(--violet-soft)" : "var(--blue-soft)"};color:${i === 0 ? "var(--violet)" : "var(--blue)"};font-size:9px">${esc(a)}</span>`).join("")}</span>
      </div>`
    )
    .join("");
  return `
  <div class="list-view">
    <div class="list-head">
      <span></span><span>Task</span><span class="lr-hide">Column</span><span class="lr-hide">Due</span><span class="lr-hide">Tags</span><span></span>
    </div>
    ${rows || '<div class="empty">No tasks yet.</div>'}
  </div>`;
}

function smartHtml() {
  return `
  <div class="smart-view">
    ${SMART_GROUPS.map(
      (g) => `<section class="smart-card">
        <h4><span style="width:26px;height:26px;border-radius:8px;display:grid;place-items:center;background:${TONE_BG[g.tone]}">${ic(g.icon, 14)}</span>${esc(g.name)}
          <span class="tag" style="margin-left:auto">${g.items.length}</span></h4>
        ${g.items
          .map((it) => {
            const t = state.tasks.find((x) => x.title === it);
            const tone = g.tone === "rose" ? "hot" : g.tone === "amber" ? "mid" : g.tone === "green" ? "ok" : "";
            return `<div class="smart-item" data-act="${t ? "task-open" : "noop"}" ${t ? `data-id="${t.id}"` : ""}>
              <span class="dot ${tone}"></span><span>${esc(it)}</span></div>`;
          })
          .join("")}
      </section>`
    ).join("")}
  </div>`;
}

function renderTasks() {
  const views = [
    { id: "smart", label: "Smart View" },
    { id: "kanban", label: "Kanban" },
    { id: "list", label: "List" },
  ];
  return `
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">Tasks</h1>
        <p class="page-sub">AI can make mistakes, please verify important details.<br />Your data is private and never shared.</p>
      </div>
      <div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap">
        <label class="ask-bar" style="min-width:280px" for="quickEntry">
          ${ic("sparkle2", 14)}
          <input id="quickEntry" placeholder="AI Quick Entry" autocomplete="off" />
        </label>
        <button class="btn btn-dark" data-act="new-task">${ic("plusSquare", 14)} New Task</button>
      </div>
    </div>

    <div class="tabs kb-tabs" role="tablist" style="margin-bottom:16px">
      ${views.map((v) => `<button class="tab ${state.taskView === v.id ? "is-active" : ""}" data-act="task-view" data-view="${v.id}" role="tab" aria-selected="${state.taskView === v.id}">${v.label}</button>`).join("")}
    </div>

    ${state.taskView === "kanban" ? kanbanHtml() : state.taskView === "list" ? listHtml() : smartHtml()}
  </div>`;
}

/* ------------------------------- modals ------------------------------- */

function openTaskModal(col = "todo", preset = null) {
  openModal({
    title: "New Task",
    width: 560,
    body: `
      <div class="field"><label for="tTitle">Title</label>
        <input class="input" id="tTitle" data-autofocus placeholder="e.g. Draft the Q3 review deck" value="${esc(preset || "")}" /></div>
      <div class="field"><label for="tDesc">Description</label>
        <textarea class="textarea" id="tDesc" placeholder="What does done look like?"></textarea></div>
      <div class="field-row">
        <div class="field"><label for="tCol">Column</label>
          <select class="select" id="tCol" style="width:100%;height:34px">
            ${TASK_COLUMNS.map((c) => `<option value="${c.id}" ${c.id === col ? "selected" : ""}>${c.name}</option>`).join("")}
          </select></div>
        <div class="field"><label for="tDate">Due date</label>
          <input class="input" id="tDate" type="date" value="2026-02-18" /></div>
      </div>
      <div class="field"><label>Tags</label>
        <div class="picker" id="tTags">
          ${[
            { t: "Deep Work", c: "rose" },
            { t: "Engineering", c: "blue" },
            { t: "Design", c: "violet" },
            { t: "Admin", c: "sky" },
            { t: "Client", c: "green" },
          ]
            .map((x) => `<button class="pick" data-tag="${x.t}" data-tone="${x.c}">${x.t}</button>`)
            .join("")}
        </div></div>
      <div class="field"><label for="tProgress">Progress — <span id="tProgVal">0</span>%</label>
        <input class="input" id="tProgress" type="range" min="0" max="100" value="0" /></div>`,
    footer: `<button class="btn btn-ghost" data-act="close-layer">Cancel</button>
             <button class="btn btn-dark" data-act="create-task">Create task</button>`,
    onMount(root) {
      const slider = root.querySelector("#tProgress");
      const label = root.querySelector("#tProgVal");
      slider.addEventListener("input", () => (label.textContent = slider.value));
      root.querySelectorAll("#tTags .pick").forEach((p) => {
        p.addEventListener("click", () => {
          p.classList.toggle("is-on");
          p.classList.toggle("tag-violet", p.classList.contains("is-on"));
          p.style.background = p.classList.contains("is-on") ? "var(--pill)" : "";
          p.style.color = p.classList.contains("is-on") ? "var(--pill-ink)" : "";
        });
      });
    },
  });
}

function openTaskDetail(id) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return;
  const col = TASK_COLUMNS.find((c) => c.id === t.col);
  openModal({
    title: t.title,
    width: 560,
    body: `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
        <span class="tag tag-violet">${esc(col.name)}</span>
        ${(t.tags || []).map((tg) => `<span class="tag ${TONE_CLASS[tg.c] || "tag-violet"}">${esc(tg.t)}</span>`).join("")}
        <span class="tag">${ic("calendar", 10)} ${esc(t.date)}</span>
      </div>
      <p style="font-size:12.5px;line-height:1.7;color:var(--ink-2);margin:0 0 14px">${esc(t.desc || "No description yet.")}</p>
      <div class="field"><label>Progress — <span id="dProgVal">${t.progress}</span>%</label>
        <input class="input" id="dProg" type="range" min="0" max="100" value="${t.progress}" /></div>
      <div class="field"><label>Move to</label>
        <div class="picker" id="dCols">
          ${TASK_COLUMNS.map((c) => `<button class="pick ${c.id === t.col ? "is-on" : ""}" data-col="${c.id}">${c.name}</button>`).join("")}
        </div></div>
      <div class="setting-row"><div class="sr-txt"><b>Comments</b><span>${t.comments} notes</span></div>
        <button class="btn btn-soft btn-sm" data-act="noop">Add</button></div>
      <div class="setting-row"><div class="sr-txt"><b>Links</b><span>${t.links} related items</span></div>
        <button class="btn btn-soft btn-sm" data-act="noop">Attach</button></div>`,
    footer: `<button class="btn btn-ghost" data-act="close-layer">Close</button>
             <button class="btn btn-soft" data-act="task-delete" data-id="${t.id}">Delete</button>
             <button class="btn btn-dark" data-act="task-save" data-id="${t.id}">Save changes</button>`,
    onMount(root) {
      const slider = root.querySelector("#dProg");
      const label = root.querySelector("#dProgVal");
      slider.addEventListener("input", () => (label.textContent = slider.value));
      root.querySelectorAll("#dCols .pick").forEach((p) => {
        p.addEventListener("click", () => {
          root.querySelectorAll("#dCols .pick").forEach((x) => x.classList.remove("is-on"));
          p.classList.add("is-on");
          const task = state.tasks.find((x) => x.id === id);
          if (task) task.col = p.dataset.col;
        });
      });
    },
  });
}

function openQuickEntry(text) {
  const parsed =
    `You said: “${text}”\n\n` +
    "Here’s what I understood:\n" +
    "• **Title** — " + text.split(/[,.]\s/)[0] + "\n" +
    "• **Column** — To Do\n" +
    "• **Due** — Feb 18\n" +
    "• **Tags** — Deep Work, Admin\n\n" +
    "I can create it, or you can adjust the details first.";

  openModal({
    title: "AI Quick Entry",
    width: 540,
    body: `<div id="qeStream" style="font-size:12.5px;line-height:1.7;min-height:120px"></div>`,
    footer: `<button class="btn btn-ghost" data-act="close-layer">Cancel</button>
             <button class="btn btn-dark" data-act="qe-create" data-text="${esc(text)}">Create task</button>`,
    onMount(root) {
      streamInto(root.querySelector("#qeStream"), parsed, ["Parsing intent…", "Matching your tasks…", "Preparing a draft…"]);
    },
  });
}

/* ------------------------------- drag & drop ------------------------------- */

let dragId = null;

function bindTasks() {
  const qe = $("#quickEntry");
  if (qe) {
    qe.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && qe.value.trim()) {
        e.preventDefault();
        openQuickEntry(qe.value.trim());
      }
    });
  }

  const kanban = $("#kanban");
  if (!kanban) return;

  kanban.addEventListener("dragstart", (e) => {
    const card = e.target.closest("[data-task]");
    if (!card) return;
    dragId = card.dataset.task;
    card.classList.add("is-dragging");
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("text/plain", dragId);
    } catch (err) {
      /* Safari guard */
    }
  });

  kanban.addEventListener("dragend", (e) => {
    const card = e.target.closest("[data-task]");
    if (card) card.classList.remove("is-dragging");
    $$(".kcol").forEach((c) => c.classList.remove("is-over"));
    dragId = null;
  });

  kanban.addEventListener("dragover", (e) => {
    const col = e.target.closest(".kcol");
    if (!col) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    $$(".kcol").forEach((c) => c.classList.toggle("is-over", c === col));
  });

  kanban.addEventListener("dragleave", (e) => {
    const col = e.target.closest(".kcol");
    if (col && !col.contains(e.relatedTarget)) col.classList.remove("is-over");
  });

  kanban.addEventListener("drop", (e) => {
    const col = e.target.closest(".kcol");
    if (!col || !dragId) return;
    e.preventDefault();
    $$(".kcol").forEach((c) => c.classList.remove("is-over"));
    const task = state.tasks.find((x) => x.id === dragId);
    if (task && task.col !== col.dataset.col) {
      task.col = col.dataset.col;
      const name = TASK_COLUMNS.find((c) => c.id === col.dataset.col).name;
      render();
      toast(`Moved to ${name}`, "check");
    }
  });
}

/* ------------------------------- events ------------------------------- */

function bindTasksStatic() {
  const qe = $("#quickEntry");
  if (qe) {
    qe.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && qe.value.trim()) {
        e.preventDefault();
        openQuickEntry(qe.value.trim());
      }
    });
  }
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;

  if (act === "task-view") {
    state.taskView = el.dataset.view;
    render();
  } else if (act === "new-task") {
    openTaskModal();
  } else if (act === "col-add") {
    openTaskModal(el.dataset.col);
  } else if (act === "col-menu") {
    const col = TASK_COLUMNS.find((c) => c.id === el.dataset.col);
    openMenu(
      el,
      [
        { id: "sort", label: "Sort by due date", icon: "filter", onSelect: () => toast(`Sorted ${col.name} by due date`, "filter") },
        { id: "priority", label: "Sort by priority", icon: "trending", onSelect: () => toast(`Sorted ${col.name} by priority`, "trending") },
        { type: "sep" },
        { id: "collapse", label: "Collapse column", icon: "chevronUp", onSelect: () => toast("Column collapsed (demo)", "chevronUp") },
        { id: "clear", label: "Clear completed", icon: "archive", danger: true, onSelect: () => toast("Completed tasks cleared (demo)", "archive") },
      ],
      { align: "right" }
    );
  } else if (act === "task-open") {
    openTaskDetail(el.dataset.id);
  } else if (act === "task-toggle") {
    e.stopPropagation();
    const t = state.tasks.find((x) => x.id === el.dataset.id);
    if (t) {
      t.done = !t.done;
      render();
      toast(t.done ? "Marked as done" : "Marked as not done", "check");
    }
  } else if (act === "create-task") {
    const title = ($("#tTitle") || {}).value || "";
    if (!title.trim()) {
      toast("Give the task a title first", "bulb");
      return;
    }
    const tags = $$("#tTags .pick.is-on").map((p) => ({ t: p.dataset.tag, c: p.dataset.tone }));
    const t = {
      id: `t${Date.now()}`,
      col: ($("#tCol") || {}).value || "todo",
      title: title.trim(),
      desc: (($("#tDesc") || {}).value || "").trim(),
      tags,
      date: "Feb 18",
      comments: 0,
      links: 0,
      progress: Number(($("#tProgress") || {}).value || 0),
      assignees: ["RM"],
      done: false,
    };
    state.tasks.push(t);
    closeLayer();
    state.taskView = "kanban";
    render();
    toast(`Task “${t.title}” created`, "check");
  } else if (act === "task-save") {
    const t = state.tasks.find((x) => x.id === el.dataset.id);
    if (t) {
      const slider = $("#dProg");
      if (slider) t.progress = Number(slider.value);
      closeLayer();
      render();
      toast("Task updated", "check");
    }
  } else if (act === "task-delete") {
    state.tasks = state.tasks.filter((x) => x.id !== el.dataset.id);
    closeLayer();
    render();
    toast("Task deleted", "archive");
  } else if (act === "qe-create") {
    state.tasks.unshift({
      id: `t${Date.now()}`,
      col: "todo",
      title: el.dataset.text.split(/[,.]\s/)[0] || el.dataset.text,
      desc: "Created with AI Quick Entry.",
      tags: [{ t: "Deep Work", c: "rose" }],
      date: "Feb 18",
      comments: 0,
      links: 0,
      progress: 0,
      assignees: ["RM"],
      done: false,
    });
    closeLayer();
    state.taskView = "kanban";
    render();
    toast("Task created from AI Quick Entry", "check");
  }
});

/* hook the quick entry binding into render */
const _bindTasks = bindTasks;
bindTasks = function () {
  _bindTasks();
  bindTasksStatic();
};
