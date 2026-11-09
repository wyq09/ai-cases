/* ==========================================================================
   Hearth — Files view
   ========================================================================== */

/* Generic streaming helper shared by Files / Tasks overlays. */
async function streamInto(el, text, stages = ["Thinking…", "Reading your workspace…", "Drafting…"]) {
  let i = 0;
  while (i < stages.length) {
    el.innerHTML = `<span class="stream-status">${ic("sparkle2", 12)}<span>${esc(stages[i])}</span></span>`;
    await sleep(420);
    i += 1;
  }
  const stage = `<span class="stream-status">${ic("sparkle2", 12)}<span>${esc(stages[stages.length - 1])}</span></span>`;
  el.innerHTML = stage;
  const span = document.createElement("span");
  const caret = document.createElement("span");
  caret.className = "caret";
  el.appendChild(span);
  el.appendChild(caret);
  let p = 0;
  while (p < text.length) {
    p = Math.min(text.length, p + 3);
    span.textContent = text.slice(0, p);
    await sleep(9);
  }
  el.innerHTML = formatReply(text);
}

/* ------------------------------- files ------------------------------- */

function insightHtml() {
  if (state.insightDismissed) {
    return `<div class="files-toolbar" style="margin-bottom:12px">
      <button class="btn btn-soft btn-sm" data-act="restore-insight">${ic("sparkle2", 13)} Show AI insight</button>
    </div>`;
  }
  return `
  <section class="insight">
    <div class="insight-art">${ART.landscape({ w: 900, h: 420 })}</div>
    <div class="hero-person insight-person">${ART.personFigure("stand")}</div>
    <div class="insight-inner">
      <div class="insight-eyebrow">${ic("sparkle2", 13)} AI INSIGHT</div>
      <h2 class="insight-title">Review pull requests<br />for API v2</h2>
      <p class="insight-desc">I’ve automatically grouped 14 new W-2s and receipts from 2023 into your Legal &amp; Finance group.</p>
      <div class="insight-actions">
        <button class="btn btn-dark" data-act="review-docs">Review Documents</button>
        <button class="btn btn-ghost" data-act="dismiss-insight">Dismiss</button>
      </div>
    </div>
  </section>`;
}

function fileCardHtml(f) {
  const tone = TONE_BG[f.tone] || TONE_BG.sky;
  const fill = TONE_FILL[f.tone] || TONE_FILL.sky;
  return `
  <article class="file-card" data-act="file-open" data-id="${f.id}" tabindex="0" role="button" aria-label="${esc(f.name)}">
    <div class="file-thumb">
      <span style="width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:${tone}">${ic(f.icon, 20)}</span>
      <div class="file-prog">
        <div class="file-prog-lbl"><span>Progress</span><span>${f.progress}%</span></div>
        <div class="file-prog-bar">
          ${Array.from({ length: 14 })
            .map((_, i) => `<i style="width:6%;background:${progressSegments(f.progress, 14)[i] ? fill : "transparent"}"></i>`)
            .join("")}
        </div>
      </div>
    </div>
    <div class="file-body">
      <h4 class="file-name">${esc(f.name)}</h4>
      <div class="file-meta">${esc(f.group)} · ${esc(f.size)}</div>
    </div>
  </article>`;
}

function recentTableHtml() {
  return `
  <table class="file-table">
    <thead>
      <tr><th>Name</th><th>Type</th><th>Size</th><th>Modified</th><th style="text-align:right">Action</th></tr>
    </thead>
    <tbody>
      ${state.recent
        .map(
          (r) => `<tr data-act="file-open" data-id="${r.id}">
            <td><span class="ft-name"><span class="file-ico" style="background:${TONE_BG[r.tone] || TONE_BG.sky}">${ic(r.icon, 15)}</span>${esc(r.name)}</span></td>
            <td><span class="tag">${esc(r.type)}</span></td>
            <td class="muted">${esc(r.size)}</td>
            <td class="muted">${esc(r.modified)}</td>
            <td style="text-align:right">
              <button class="icon-btn" data-act="file-menu" data-id="${r.id}" aria-label="More actions">${ic("dotsV", 15)}</button>
            </td>
          </tr>`
        )
        .join("")}
    </tbody>
  </table>`;
}

function storageHtml() {
  const total = storageTotal(STORAGE);
  return `
  <div class="storage-card">
    <div style="display:flex;align-items:center;justify-content:space-between">
      <h3 style="margin:0;font-family:var(--font-display);font-size:14px">Storage</h3>
      <button class="muted tiny" data-act="storage-detail" style="cursor:pointer">130 GB of 200 GB</button>
    </div>
    <div class="storage-bar" style="margin-top:12px">
      ${storageSegments(STORAGE, total).map((s) => `<i style="width:${s.pct}%;background:${s.color}"></i>`).join("")}
    </div>
    <div class="storage-legend">
      ${STORAGE.map(
        (s) => `<div class="leg"><i style="background:${s.color}"></i><span>${esc(s.name)}</span></div>`
      ).join("")}
    </div>
  </div>`;
}

function groupsHtml() {
  return `
  <div class="side-block">
    <h4>${ic("sparkle2", 16)} Semantic Groups</h4>
    ${FILE_GROUPS.map(
      (g) => `<div class="group-row" data-act="group-open" data-id="${g.id}">
        <span class="group-ico" style="background:${TONE_BG[g.color]}">${ic(g.icon, 15)}</span>
        <span class="group-txt"><b>${esc(g.name)}</b><span>${esc(g.sub)}</span></span>
        <button class="icon-btn" data-act="group-menu" data-id="${g.id}" aria-label="Group actions">${ic("dotsV", 15)}</button>
      </div>`
    ).join("")}
  </div>`;
}

function syncHtml() {
  return `
  <div class="side-block">
    <h4>${ic("cloud", 16)} Cloud Sync</h4>
    ${state.sync
      .map(
        (s) => `<div class="sync-row">
          <span class="sync-ico" style="background:${s.tone === "blue" ? "var(--blue)" : "var(--rose)"}">${ic(s.icon, 15)}</span>
          <span class="sync-txt">
            <b>${esc(s.name)}</b>
            <span class="sync-track"><i style="width:${s.pct}%;background:${s.tone === "blue" ? "var(--blue)" : "var(--rose)"}"></i></span>
          </span>
          <span class="sync-pct" style="color:${s.tone === "blue" ? "var(--blue)" : "var(--rose)"}">${s.pct}%</span>
        </div>`
      )
      .join("")}
  </div>`;
}

function foldersHtml() {
  return `
  <div class="side-block">
    <h4>${ic("folder", 16)} Local Folder</h4>
    ${LOCAL_FOLDERS.map(
      (f) => `<div class="folder-row" data-act="folder-open" data-id="${f.id}">
        <span class="folder-ico">${ic(f.icon, 15)}</span>
        <span class="group-txt"><b>${esc(f.name)}</b><span>${esc(f.sub)}</span></span>
        ${ic("chevronRight", 14)}
      </div>`
    ).join("")}
  </div>`;
}

function renderFiles() {
  const filtered = filterFiles(state.files, state.fileFilter);

  return `
  <div class="page page-wide">
    <div class="files-layout">
      <div>
        ${insightHtml()}
        <div class="files-toolbar">
          <label class="ask-bar" for="askAI">
            ${ic("sparkle2", 14)}
            <input id="askAI" placeholder="Ask AI: ‘Find the rental agreement from last June’…" autocomplete="off" />
            <span class="kbd">⌘K</span>
          </label>
          <span class="select-wrap">
            <select class="select" data-act="file-filter">
              ${["All Files", ...FILE_GROUPS.map((g) => g.name)].map((o) => `<option ${state.fileFilter === o ? "selected" : ""}>${esc(o)}</option>`).join("")}
            </select>
            ${ic("chevronDown", 12)}
          </span>
          <button class="icon-square ${state.fileLayout === "grid" ? "is-active" : ""}" data-act="layout" data-layout="grid" aria-label="Grid view" title="Grid view">${ic("grid", 15)}</button>
          <button class="icon-square ${state.fileLayout === "list" ? "is-active" : ""}" data-act="layout" data-layout="list" aria-label="List view" title="List view">${ic("list", 15)}</button>
          <button class="icon-square" data-act="file-filters" aria-label="Filters" title="Filters">${ic("filter", 15)}</button>
        </div>

        ${
          state.fileLayout === "grid"
            ? `<div class="file-grid">${filtered.map(fileCardHtml).join("") || '<div class="empty">No files in this group yet.</div>'}</div>`
            : `<div class="panel" style="padding:12px">${recentTableHtml()}</div>`
        }

        <section style="margin-top:22px">
          <h2 class="section-title">${ic("clock", 16)} Recent File</h2>
          <div class="panel" style="padding:12px 14px">${recentTableHtml()}</div>
        </section>
      </div>

      <aside>
        ${storageHtml()}
        ${groupsHtml()}
        ${syncHtml()}
        ${foldersHtml()}
      </aside>
    </div>
  </div>`;
}

/* ------------------------------- modals ------------------------------- */

function openReviewDocs() {
  const text =
    "I reviewed 14 documents in your Legal & Finance group.\n\n" +
    "• **3 rental agreements** — SF_Rental_Agreement_2026.pdf is the newest and matches the address on your file.\n" +
    "• **6 W-2 forms** — grouped by year; 2023 and 2024 are still missing.\n" +
    "• **5 receipts** — Apple Store and travel receipts, already matched to Q3_Expense_Report.csv.\n\n" +
    "I can pull the missing years into a checklist, or start the API v2 review — which first?";

  openModal({
    title: "Review Documents",
    width: 560,
    body: `<div id="reviewStream" style="font-size:12.5px;line-height:1.7;min-height:140px"></div>`,
    footer: `<button class="btn btn-ghost" data-act="close-layer">Close</button>
             <button class="btn btn-dark" data-act="review-to-tasks">Create tasks</button>`,
    onMount(root) {
      streamInto(root.querySelector("#reviewStream"), text, [
        "Opening Legal & Finance…",
        "Reading 14 documents…",
        "Grouping and summarizing…",
      ]);
    },
  });
}

function openAskAI(query) {
  const text =
    `Searching your workspace for “${query}”.\n\n` +
    "• **SF_Rental_Agreement_2026.pdf** — the current lease, modified Jun 20, 2026.\n" +
    "• **SF_Rental_Agreement_2025.pdf** — last year’s version, still in Legal & Finance.\n\n" +
    "The 2026 file is the one you want; I’ve highlighted the term dates and the renewal clause.";

  openModal({
    title: "Ask AI",
    width: 560,
    body: `<div id="askStream" style="font-size:12.5px;line-height:1.7;min-height:120px"></div>`,
    footer: `<button class="btn btn-ghost" data-act="close-layer">Close</button>
             <button class="btn btn-dark" data-act="ask-open-result">Open result</button>`,
    onMount(root) {
      streamInto(root.querySelector("#askStream"), text, [
        "Searching files…",
        "Matching semantic groups…",
        "Composing the answer…",
      ]);
    },
  });
}

function openFilePreview(id) {
  const f =
    state.files.find((x) => x.id === id) ||
    state.recent.find((x) => x.id === id) ||
    { id, name: "Untitled", type: "File", size: "—", modified: "—", group: "—", icon: "file", tone: "sky", progress: 0 };
  openModal({
    title: f.name,
    width: 540,
    body: `
      <div style="height:150px;border-radius:14px;background:var(--wash);display:grid;place-items:center;margin-bottom:14px">
        <span style="width:56px;height:56px;border-radius:16px;display:grid;place-items:center;background:${TONE_BG[f.tone] || TONE_BG.sky}">${ic(f.icon, 26)}</span>
      </div>
      <div class="setting-row"><div class="sr-txt"><b>Type</b></div><span class="tag">${esc(f.type)}</span></div>
      <div class="setting-row"><div class="sr-txt"><b>Size</b></div><span>${esc(f.size)}</span></div>
      <div class="setting-row"><div class="sr-txt"><b>Group</b></div><span>${esc(f.group || "—")}</span></div>
      <div class="setting-row"><div class="sr-txt"><b>Modified</b></div><span>${esc(f.modified || "Today")}</span></div>
      <div class="setting-row"><div class="sr-txt"><b>Indexing</b><span>Semantic indexing status</span></div>
        <span class="tag ${f.progress >= 100 ? "tag-green" : "tag-amber"}">${f.progress >= 100 ? "Indexed" : `${f.progress}%`}</span></div>`,
    footer: `<button class="btn btn-ghost" data-act="close-layer">Close</button>
             <button class="btn btn-soft" data-act="file-share" data-name="${esc(f.name)}">${ic("link", 13)} Share</button>
             <button class="btn btn-dark" data-act="file-download" data-name="${esc(f.name)}">${ic("download", 13)} Download</button>`,
  });
}

/* ------------------------------- events ------------------------------- */

function bindFiles() {
  const ask = $("#askAI");
  if (ask) {
    ask.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && ask.value.trim()) {
        e.preventDefault();
        openAskAI(ask.value.trim());
      }
    });
  }
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;

  if (act === "review-docs") {
    openReviewDocs();
  } else if (act === "dismiss-insight") {
    state.insightDismissed = true;
    render();
    toast("Insight dismissed", "close");
  } else if (act === "restore-insight") {
    state.insightDismissed = false;
    render();
  } else if (act === "layout") {
    state.fileLayout = el.dataset.layout;
    render();
  } else if (act === "file-open") {
    openFilePreview(el.dataset.id);
  } else if (act === "file-menu") {
    e.stopPropagation();
    openMenu(
      el,
      [
        { id: "open", label: "Open", icon: "eye", onSelect: () => openFilePreview(el.dataset.id) },
        { id: "rename", label: "Rename", icon: "file", onSelect: () => toast("Rename is not connected to a backend yet", "bulb") },
        { id: "share", label: "Share link", icon: "link", onSelect: () => toast("Share link copied", "link") },
        { id: "download", label: "Download", icon: "download", onSelect: () => toast("Download started", "download") },
        { type: "sep" },
        { id: "del", label: "Delete", icon: "archive", danger: true, onSelect: () => toast("File archived (demo)", "archive") },
      ],
      { align: "right" }
    );
  } else if (act === "group-menu") {
    e.stopPropagation();
    const g = FILE_GROUPS.find((x) => x.id === el.dataset.id);
    openMenu(
      el,
      [
        { id: "open", label: "Open group", icon: "folder", onSelect: () => { state.fileFilter = g.name; render(); } },
        { id: "rename", label: "Rename group", icon: "file", onSelect: () => toast("Rename is not connected to a backend yet", "bulb") },
        { id: "merge", label: "Merge into…", icon: "layers", onSelect: () => toast("Pick another group to merge into", "layers") },
        { type: "sep" },
        { id: "del", label: "Delete group", icon: "archive", danger: true, onSelect: () => toast("Group archived (demo)", "archive") },
      ],
      { align: "right" }
    );
  } else if (act === "group-open") {
    const g = FILE_GROUPS.find((x) => x.id === el.dataset.id);
    if (g) {
      state.fileFilter = g.name === "All Intelligent" ? "All Files" : g.name;
      render();
    }
  } else if (act === "folder-open") {
    openModal({
      title: "Local folder",
      body: `<div class="empty" style="padding:26px">This folder is watched by the local agent. Files dropped here are grouped automatically.</div>`,
      footer: `<button class="btn btn-ghost" data-act="close-layer">Close</button>
               <button class="btn btn-dark" data-act="noop">Choose folder</button>`,
    });
  } else if (act === "storage-detail") {
    openModal({
      title: "Storage",
      width: 460,
      body: `<div class="storage-arc">${ART.storageDonut(130, 200)}</div>
        ${STORAGE.map((s) => `<div class="setting-row"><div class="sr-txt"><b>${esc(s.name)}</b></div><span>${s.gb} GB</span></div>`).join("")}`,
      footer: `<button class="btn btn-ghost" data-act="close-layer">Close</button>
               <button class="btn btn-dark" data-act="noop">Upgrade plan</button>`,
    });
  } else if (act === "file-filters") {
    openMenu(
      el,
      [
        { type: "label", label: "Filter by" },
        { id: "all", label: "Everything", icon: "layers", onSelect: () => { state.fileFilter = "All Files"; render(); } },
        { id: "docs", label: "Documents", icon: "file", onSelect: () => toast("Filtered to documents", "filter") },
        { id: "media", label: "Images & media", icon: "image", onSelect: () => toast("Filtered to images & media", "filter") },
        { id: "audio", label: "Audio", icon: "pulse", onSelect: () => toast("Filtered to audio", "filter") },
        { type: "sep" },
        { id: "new", label: "Only indexed", icon: "check", onSelect: () => toast("Showing fully indexed files", "check") },
      ],
      { align: "right" }
    );
  } else if (act === "file-share") {
    toast(`Link copied for ${el.dataset.name}`, "link");
  } else if (act === "file-download") {
    toast(`Preparing ${el.dataset.name}`, "download");
  } else if (act === "review-to-tasks") {
    ["Confirm missing 2023 W-2s", "Match receipts to Q3 expense report", "Draft renewal reminder"].forEach((t, i) => {
      state.tasks.unshift({
        id: `t${Date.now()}-${i}`,
        col: "todo",
        title: t,
        desc: "Created from the AI document review.",
        tags: [{ t: "Deep Work", c: "rose" }],
        date: "Feb 18",
        comments: 0,
        links: 0,
        progress: 0,
        assignees: ["RM"],
      });
    });
    closeLayer();
    toast("3 tasks created", "tasks");
    go("tasks");
  } else if (act === "ask-open-result") {
    closeLayer();
    state.fileFilter = "Legal & Finance";
    render();
  }
});

document.addEventListener("change", (e) => {
  if (e.target.dataset && e.target.dataset.act === "file-filter") {
    state.fileFilter = e.target.value;
    render();
  }
});
