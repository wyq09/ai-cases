/* ==========================================================================
   Hearth — Calendar & Memory views
   ========================================================================== */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function renderCalendar() {
  const year = 2026;
  const month = 1; /* February */
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7; /* Monday-first */
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];

  for (let i = 0; i < startOffset; i++) {
    const d = new Date(year, month - 1, 31 - (startOffset - 1 - i));
    cells.push({ day: d.getDate(), out: true });
  }
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, out: false });
  while (cells.length % 7 !== 0) cells.push({ day: cells.length - daysInMonth - startOffset + 1, out: true });

  return `
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">Calendar</h1>
        <p class="page-sub">February 2026 · ${state.calEvents ? state.calEvents.length : CAL_EVENTS.length} events. Click a day to add an event.</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-ghost btn-sm" data-act="cal-prev">${ic("chevronLeft", 14)} Prev</button>
        <button class="btn btn-ghost btn-sm" data-act="cal-today">Today</button>
        <button class="btn btn-ghost btn-sm" data-act="cal-next">Next ${ic("chevronRight", 14)}</button>
        <button class="btn btn-dark" data-act="new-event">${ic("plus", 14)} New Event</button>
      </div>
    </div>

    <div class="goals-cols">
      <div class="panel">
        <div class="cal-grid" style="margin-bottom:6px">
          ${WEEKDAYS.map((w) => `<div class="cal-head">${w}</div>`).join("")}
        </div>
        <div class="cal-grid">
          ${cells
            .map((c) => {
              const evs = CAL_EVENTS.filter((e) => !c.out && e.day === c.day);
              const today = !c.out && c.day === 18;
              return `<div class="cal-cell ${c.out ? "is-out" : ""} ${today ? "is-today" : ""}" data-act="cal-day" data-day="${c.day}" ${c.out ? 'data-out="1"' : ""}>
                <b>${c.day}</b>
                ${evs.map((e) => `<div class="cal-ev">${esc(e.title)}</div>`).join("")}
              </div>`;
            })
            .join("")}
        </div>
      </div>

      <aside>
        <h2 class="section-title">${ic("clock", 16)} Upcoming</h2>
        <div class="panel">
          ${CAL_EVENTS.slice()
            .sort((a, b) => a.day - b.day)
            .map(
              (e) => `<div class="setting-row">
                <div class="sr-txt"><b>${esc(e.title)}</b><span>Feb ${e.day} · ${e.day % 2 ? "09:30" : "14:00"}</span></div>
                <button class="icon-btn" data-act="cal-edit" data-title="${esc(e.title)}" aria-label="Edit">${ic("dotsV", 14)}</button>
              </div>`
            )
            .join("")}
        </div>
        <h2 class="section-title" style="margin-top:18px">${ic("link", 16)} Linked goals</h2>
        <div class="panel">
          ${state.goals
            .map(
              (g) => `<div class="setting-row"><div class="sr-txt"><b>${esc(g.name)}</b><span>${g.value}% complete</span></div>
                <span class="tag tag-violet">${esc(g.tag)}</span></div>`
            )
            .join("")}
        </div>
      </aside>
    </div>
  </div>`;
}

function renderMemory() {
  return `
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">Memory</h1>
        <p class="page-sub">Everything Hearth remembers about you. Review, edit or forget any entry.</p>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" data-act="mem-search">${ic("search", 14)} Search</button>
        <button class="btn btn-dark" data-act="new-memory">${ic("plus", 14)} New Memory</button>
      </div>
    </div>

    <div class="mem-list">
      ${MEMORIES.map(
        (m) => `<article class="mem-card" data-act="mem-open" data-id="${m.id}" tabindex="0" role="button">
          <h4>${esc(m.title)}</h4>
          <p>${esc(m.body)}</p>
          <div class="mem-foot">
            ${m.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join(" ")}
            <span style="margin-left:auto">${esc(m.date)}</span>
          </div>
        </article>`
      ).join("")}
    </div>

    <section style="margin-top:24px">
      <h2 class="section-title">${ic("pulse", 16)} Captured this week</h2>
      <div class="panel">
        ${["Preferred a 90-minute deep-work block before noon.", "Mentioned budget for the NYC move is $4,200/month.", "Asked for a weekly fitness summary every Sunday.", "Wants invoices auto-matched to the Q3 expense report."]
          .map((t) => `<div class="setting-row"><div class="sr-txt"><b style="font-weight:500;font-size:12px">${esc(t)}</b></div><span class="tag tag-green">auto</span></div>`)
          .join("")}
      </div>
    </section>
  </div>`;
}

/* ------------------------------- modals ------------------------------- */

function openEventModal() {
  openModal({
    title: "New Event",
    body: `
      <div class="field"><label for="eTitle">Title</label>
        <input class="input" id="eTitle" data-autofocus placeholder="e.g. Strategy review" /></div>
      <div class="field-row">
        <div class="field"><label for="eDate">Date</label><input class="input" id="eDate" type="date" value="2026-02-18" /></div>
        <div class="field"><label for="eTime">Time</label><input class="input" id="eTime" type="time" value="09:30" /></div>
      </div>
      <div class="field"><label for="eNote">Notes</label><textarea class="textarea" id="eNote" placeholder="Agenda, links…"></textarea></div>`,
    footer: `<button class="btn btn-ghost" data-act="close-layer">Cancel</button>
             <button class="btn btn-dark" data-act="create-event">Create event</button>`,
  });
}

function openNoteModal() {
  openModal({
    title: "New Note",
    body: `<div class="field"><label for="nTitle">Title</label><input class="input" id="nTitle" data-autofocus placeholder="Untitled note" /></div>
      <div class="field"><label for="nBody">Note</label><textarea class="textarea" id="nBody" style="min-height:140px" placeholder="Write anything…"></textarea></div>`,
    footer: `<button class="btn btn-ghost" data-act="close-layer">Cancel</button>
             <button class="btn btn-dark" data-act="create-note">Save note</button>`,
  });
}

function openMemoryModal() {
  openModal({
    title: "New Memory",
    body: `<div class="field"><label for="mTitle">Title</label><input class="input" id="mTitle" data-autofocus placeholder="What should Hearth remember?" /></div>
      <div class="field"><label for="mBody">Detail</label><textarea class="textarea" id="mBody" placeholder="Add context so it stays useful…"></textarea></div>`,
    footer: `<button class="btn btn-ghost" data-act="close-layer">Cancel</button>
             <button class="btn btn-dark" data-act="create-memory">Remember</button>`,
  });
}

/* ------------------------------- events ------------------------------- */

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;

  if (act === "new-event") {
    openEventModal();
  } else if (act === "create-event") {
    const t = ($("#eTitle") || {}).value || "";
    if (!t.trim()) {
      toast("Give the event a title", "bulb");
      return;
    }
    const d = ($("#eDate") || {}).value || "2026-02-18";
    const day = Number(d.split("-")[2] || 18);
    CAL_EVENTS.push({ day, title: t.trim() });
    closeLayer();
    render();
    toast(`Event added on Feb ${day}`, "calendarPlus");
  } else if (act === "cal-day") {
    if (el.dataset.out) return;
    openEventModal();
  } else if (act === "cal-edit") {
    openMenu(
      el,
      [
        { id: "edit", label: "Edit event", icon: "file", onSelect: () => toast("Editing is not connected to a backend yet", "bulb") },
        { id: "delete", label: "Delete event", icon: "archive", danger: true, onSelect: () => toast("Event deleted (demo)", "archive") },
      ],
      { align: "right" }
    );
  } else if (act === "cal-prev" || act === "cal-next" || act === "cal-today") {
    toast(act === "cal-today" ? "Jumped to today" : "Month navigation is a demo placeholder", "calendar");
  } else if (act === "new-memory") {
    openMemoryModal();
  } else if (act === "create-memory") {
    const t = ($("#mTitle") || {}).value || "";
    if (!t.trim()) {
      toast("Add a title first", "bulb");
      return;
    }
    MEMORIES.unshift({
      id: `m${Date.now()}`,
      title: t.trim(),
      body: (($("#mBody") || {}).value || "Saved manually.").trim(),
      tags: ["manual"],
      date: "Updated just now",
    });
    closeLayer();
    render();
    toast("Memory saved", "brain");
  } else if (act === "mem-open") {
    const m = MEMORIES.find((x) => x.id === el.dataset.id);
    if (!m) return;
    openModal({
      title: m.title,
      body: `<p style="font-size:12.5px;line-height:1.75;color:var(--ink-2);margin:0 0 14px">${esc(m.body)}</p>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${m.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join("")}</div>`,
      footer: `<button class="btn btn-ghost" data-act="close-layer">Close</button>
               <button class="btn btn-soft" data-act="mem-forget" data-id="${m.id}">Forget</button>`,
    });
  } else if (act === "mem-forget") {
    const idx = MEMORIES.findIndex((x) => x.id === el.dataset.id);
    if (idx >= 0) MEMORIES.splice(idx, 1);
    closeLayer();
    render();
    toast("Memory forgotten", "archive");
  } else if (act === "mem-search") {
    openCmdk("memory");
  } else if (act === "new-note") {
    openNoteModal();
  } else if (act === "create-note") {
    const t = ($("#nTitle") || {}).value || "Untitled note";
    state.recent.unshift({
      id: `n${Date.now()}`,
      name: `${t}.md`,
      type: "Note",
      size: `${(($("#nBody") || {}).value || "").length} chars`,
      modified: "Just now",
      icon: "file",
      tone: "violet",
    });
    closeLayer();
    go("files");
    toast("Note saved to your files", "file");
  }
});
