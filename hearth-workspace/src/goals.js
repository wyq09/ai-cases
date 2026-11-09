/* ==========================================================================
   Hearth — Goals view
   ========================================================================== */

function goalTabsHtml() {
  return `<div class="tabs" role="tablist">
    ${GOAL_TABS.map(
      (t) => `<button class="tab ${state.goalTab === t ? "is-active" : ""}" data-act="goal-tab" data-tab="${esc(t)}" role="tab" aria-selected="${state.goalTab === t}">${esc(t)}</button>`
    ).join("")}
  </div>`;
}

function goalHeroHtml() {
  return `
  <section class="hero">
    <div class="hero-art">${ART.landscape({ w: 1200, h: 420 })}</div>
    <div class="hero-person">${ART.personFigure("sit")}</div>
    <div class="hero-inner">
      <div class="hero-eyebrow">${ic("sparkle2", 13)} WELCOME BACK</div>
      <h1 class="hero-title">Life Goals</h1>
      <p class="hero-sub">Strategic alignment and quarterly targets.</p>
      <div class="hero-actions">
        <button class="btn btn-dark" data-act="new-goal">${ic("plus", 15)} New Goal</button>
        <button class="btn btn-ghost" data-act="toggle-board">${ic("eye", 15)} Vision Board</button>
      </div>
    </div>
  </section>`;
}

function targetCardHtml(g) {
  const week = state.goalWeek[g.id] || "W1";
  const values = goalSeries(g, week);
  const chart =
    g.id === "g2"
      ? ART.barChart(values, { width: 320, height: 84 })
      : ART.sparkline(values, { width: 320, height: 84, marker: Math.floor(values.length * 0.62) });
  const value = goalValueForWeek(g, week);
  return `
  <article class="target-card" data-act="goal-detail" data-id="${g.id}" tabindex="0" role="button" aria-label="${esc(g.name)}">
    <div class="target-head">
      <div>
        <h3 class="target-name">${esc(g.name)}</h3>
        <div class="target-pillar">${esc(g.pillar)}</div>
      </div>
      <span class="target-lock">${ic(g.locked ? "lock" : "heart", 17)}</span>
    </div>
    <div class="target-val">${value}%</div>
    <div class="target-metric">${esc(goalMetricForWeek(g, week))}</div>
    <div class="week-switch" role="group" aria-label="Week">
      ${["W1", "W2", "W3"].map((w) => `<button class="${w === week ? "is-active" : ""}" data-act="week" data-id="${g.id}" data-week="${w}">${w}</button>`).join("")}
    </div>
    ${chart}
  </article>`;
}

function visionCardHtml(v) {
  return `
  <article class="vision-card" data-act="vision-detail" data-id="${v.id}" tabindex="0" role="button" aria-label="${esc(v.title)}">
    <div class="vision-art">
      <span class="art-badge">${v.badge}</span>
      ${ART[v.art]}
    </div>
    <div class="vision-body">
      <h3 class="vision-title">${esc(v.title)}</h3>
      <p class="vision-desc">${esc(v.desc)}</p>
      <div class="vision-foot">
        <span class="tag ${TONE_CLASS[v.statusTone]}">${ic("clock", 10)} ${esc(v.status)}</span>
        <span>${esc(v.date)}</span>
      </div>
    </div>
  </article>`;
}

function pillarsHtml() {
  return `
  <div class="pillars">
    ${state.pillars
      .map(
        (p) => `<div class="pillar" data-act="pillar-filter" data-id="${esc(p.id)}" tabindex="0" role="button">
          <span class="pillar-ico" style="background:${TONE_BG[p.color]}">${ic(p.icon, 15)}</span>
          <span class="pillar-txt"><b>${esc(p.name)}</b><span>${esc(p.sub)}</span></span>
          <span class="pillar-count">${p.count}</span>
        </div>`
      )
      .join("")}
  </div>`;
}

function quickStatsHtml() {
  return `
  <div class="quick-stats">
    <h3 class="section-title" style="font-size:14px;margin-bottom:4px">Quick Stats</h3>
    <div class="qs-grid">
      ${QUICK_STATS.map(
        (q) => `<div class="qs">
          <span class="qs-ico" style="background:${TONE_BG[q.color]}">${ic(q.icon, 14)}</span>
          <div><div class="qs-val">${esc(q.value)}</div><div class="qs-lbl">${esc(q.label)}</div></div>
        </div>`
      ).join("")}
    </div>
  </div>`;
}

function boardViewHtml() {
  const groups = ["Health", "Career", "Growth"];
  return `<div class="board-view">
    ${groups
      .map((g) => {
        const items = state.vision.filter((v) => v.pillar === g);
        const targets = state.goals.filter((x) => x.tag === g);
        return `<div class="board-col">
          <h4><span>${esc(g)}</span><span class="tag">${items.length + targets.length}</span></h4>
          ${targets
            .map(
              (t) => `<div class="board-mini" data-act="goal-detail" data-id="${t.id}">
                <b style="font-family:var(--font-display)">${esc(t.name)}</b>
                <small>Target · ${t.value}%</small>
              </div>`
            )
            .join("")}
          ${items
            .map(
              (v) => `<div class="board-mini" data-act="vision-detail" data-id="${v.id}">
                <b style="font-family:var(--font-display)">${esc(v.title)}</b>
                <small>${esc(v.status)} · ${esc(v.date)}</small>
              </div>`
            )
            .join("")}
          ${!items.length && !targets.length ? '<div class="muted" style="font-size:11px;padding:6px 2px">Nothing here yet.</div>' : ""}
          <button class="add-task" data-act="new-goal">${ic("plus", 13)} Add to ${esc(g)}</button>
        </div>`;
      })
      .join("")}
  </div>`;
}

function renderGoals() {
  const filtered = filterGoals(state.goals, state.goalTab);
  const isBoard = state.goalView === "board";

  return `
  <div class="page">
    ${goalHeroHtml()}
    <div class="goals-toolbar">
      ${goalTabsHtml()}
      <div style="display:flex;align-items:center;gap:10px">
        <span class="select-wrap">
          <select class="select" data-act="quarter">
            ${["Q3 2026", "Q2 2026", "Q1 2026", "Q4 2026"].map((q) => `<option ${state.goalQuarter === q ? "selected" : ""}>${q}</option>`).join("")}
          </select>
          ${ic("chevronDown", 12)}
        </span>
      </div>
    </div>

    ${
      isBoard
        ? `<section class="section-title">${ic("eye", 16)} Vision Board</section>${boardViewHtml()}`
        : `<div class="goals-cols">
            <div>
              <section>
                <h2 class="section-title">${ic("clock", 16)} Active Targets</h2>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px">
                  ${
                    filtered.length
                      ? filtered.map(targetCardHtml).join("")
                      : '<div class="empty">No goals in this category yet. Create one with <b>New Goal</b>.</div>'
                  }
                </div>
              </section>
              <section style="margin-top:22px">
                <h2 class="section-title">${ic("eye", 16)} Vision Board</h2>
                <div class="vision-grid">${state.vision.map(visionCardHtml).join("")}</div>
              </section>
            </div>
            <aside>
              <h2 class="section-title">${ic("heart", 16)} Life Pillars</h2>
              ${pillarsHtml()}
              ${quickStatsHtml()}
            </aside>
          </div>`
    }
  </div>`;
}

/* ----------------------------- modals ----------------------------- */

function openGoalModal() {
  openModal({
    title: "New Goal",
    body: `
      <div class="field"><label for="gName">Goal name</label>
        <input class="input" id="gName" data-autofocus placeholder="e.g. Run a half marathon" /></div>
      <div class="field-row">
        <div class="field"><label for="gPillar">Pillar</label>
          <select class="select" id="gPillar" style="width:100%;height:34px">
            <option>Health</option><option>Career</option><option>Growth</option><option>Relationships</option>
          </select></div>
        <div class="field"><label for="gTarget">Target %</label>
          <input class="input" id="gTarget" type="number" min="1" max="100" value="60" /></div>
      </div>
      <div class="field"><label for="gMetric">Metric</label>
        <input class="input" id="gMetric" placeholder="e.g. Weekly training sessions" /></div>
      <div class="field"><label for="gDeadline">Deadline</label>
        <input class="input" id="gDeadline" type="date" value="2026-12-31" /></div>`,
    footer: `<button class="btn btn-ghost" data-act="close-layer">Cancel</button>
             <button class="btn btn-dark" data-act="create-goal">Create goal</button>`,
  });
}

function openGoalDetail(id) {
  const g = state.goals.find((x) => x.id === id);
  if (!g) return;
  const week = state.goalWeek[g.id] || "W1";
  const values = goalSeries(g, week);
  const chart = g.id === "g2" ? ART.barChart(values, { width: 420, height: 120 }) : ART.sparkline(values, { width: 420, height: 120 });
  openModal({
    title: g.name,
    width: 540,
    body: `
      <p class="muted" style="font-size:11px;margin:0 0 14px">${esc(g.pillar)} · ${esc(g.tag)} · ${esc(state.goalQuarter)}</p>
      <div style="display:flex;align-items:flex-end;gap:14px;margin-bottom:6px">
        <div style="font-family:var(--font-display);font-size:38px;font-weight:700;line-height:1">${g.value}%</div>
        <div class="muted" style="font-size:11.5px;padding-bottom:6px">${esc(g.metric)}</div>
      </div>
      ${chart}
      <div class="field" style="margin-top:16px"><label>Progress this week</label>
        <input class="input" type="range" min="0" max="100" value="${g.value}" id="goalSlider" /></div>
      <div class="panel" style="margin-top:10px">
        <b style="font-size:12px">Latest signal</b>
        <p class="muted" style="font-size:11.5px;line-height:1.6;margin:6px 0 0">
          Progress is computed from your ${esc(g.tag.toLowerCase())} activity, the tasks tagged
          <b>${esc(g.tag)}</b> and the files in your workspace.
        </p>
      </div>`,
    footer: `<button class="btn btn-ghost" data-act="close-layer">Close</button>
             <button class="btn btn-dark" data-act="goal-bump" data-id="${g.id}">Update progress</button>`,
    onMount(root) {
      const slider = root.querySelector("#goalSlider");
      if (slider) {
        slider.addEventListener("input", () => {
          const g2 = state.goals.find((x) => x.id === id);
          if (g2) g2.value = Number(slider.value);
        });
      }
    },
  });
}

function openVisionDetail(id) {
  const v = state.vision.find((x) => x.id === id);
  if (!v) return;
  openModal({
    title: v.title,
    width: 560,
    body: `
      <div class="vision-art" style="height:170px;border-radius:14px;margin-bottom:14px">${ART[v.art]}</div>
      <p style="font-size:12.5px;line-height:1.7;color:var(--ink-2);margin:0 0 14px">${esc(v.desc)}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
        <span class="tag ${TONE_CLASS[v.statusTone]}">${esc(v.status)}</span>
        <span class="tag">${esc(v.pillar)}</span>
        <span class="tag">${esc(v.date)}</span>
      </div>
      <div class="field"><label>Status</label>
        <div class="picker">
          ${["Planned", "In Progress", "Completed"].map((s) => `<button class="pick ${s === v.status ? "is-on" : ""}" data-act="vision-status" data-id="${v.id}" data-status="${s}">${s}</button>`).join("")}
        </div></div>`,
    footer: `<button class="btn btn-ghost" data-act="close-layer">Close</button>
             <button class="btn btn-dark" data-act="vision-to-task" data-id="${v.id}">Turn into a task</button>`,
  });
}

/* ----------------------------- events ----------------------------- */

function bindGoals() {
  /* nothing to bind statically — everything is delegated */
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;

  if (act === "goal-tab") {
    state.goalTab = el.dataset.tab;
    render();
  } else if (act === "toggle-board") {
    state.goalView = state.goalView === "board" ? "targets" : "board";
    render();
  } else if (act === "week") {
    e.stopPropagation();
    state.goalWeek[el.dataset.id] = el.dataset.week;
    render();
  } else if (act === "goal-detail") {
    openGoalDetail(el.dataset.id);
  } else if (act === "vision-detail") {
    openVisionDetail(el.dataset.id);
  } else if (act === "new-goal") {
    openGoalModal();
  } else if (act === "create-goal") {
    const name = ($("#gName") || {}).value || "";
    if (!name.trim()) {
      toast("Give your goal a name first", "bulb");
      return;
    }
    const pillar = ($("#gPillar") || {}).value || "Health";
    const target = Number(($("#gTarget") || {}).value || 60);
    const metric = (($("#gMetric") || {}).value || "Weekly progress").trim();
    const id = `g${Date.now()}`;
    const weeks = { W1: [20, 26, 24, 32, 38], W2: [26, 34, 30, 40, 46], W3: [34, 42, 38, 48, 56] };
    state.goals.push({
      id,
      name: name.trim(),
      pillar: `${pillar.toUpperCase()} PILLAR`,
      tag: pillar,
      icon: pillar === "Health" ? "heart" : pillar === "Career" ? "briefcase" : "trending",
      value: target,
      metric,
      weeks,
      accent: "#7c5cf0",
      locked: false,
    });
    state.pillars = pillarTotals(state.pillars, state.goals);
    closeLayer();
    state.goalTab = "All Goals";
    render();
    toast(`Goal “${name.trim()}” created`, "check");
  } else if (act === "goal-bump") {
    const g = state.goals.find((x) => x.id === el.dataset.id);
    if (g) {
      g.value = Math.min(100, g.value + 5);
      closeLayer();
      render();
      toast(`${g.name} is now ${g.value}%`, "trending");
    }
  } else if (act === "vision-status") {
    const v = state.vision.find((x) => x.id === el.dataset.id);
    if (v) {
      v.status = el.dataset.status;
      v.statusTone = v.status === "Completed" ? "green" : v.status === "Planned" ? "sky" : "violet";
      closeLayer();
      render();
      toast(`“${v.title}” is now ${v.status}`, "check");
    }
  } else if (act === "vision-to-task") {
    const v = state.vision.find((x) => x.id === el.dataset.id);
    if (v) {
      state.tasks.unshift({
        id: `t${Date.now()}`,
        col: "todo",
        title: v.title,
        desc: v.desc,
        tags: [{ t: v.pillar, c: "violet" }],
        date: "Feb 18",
        comments: 0,
        links: 0,
        progress: 0,
        assignees: ["RM"],
      });
      closeLayer();
      toast("Task created from vision", "tasks");
      go("tasks");
    }
  } else if (act === "pillar-filter") {
    const p = state.pillars.find((x) => x.id === el.dataset.id);
    if (p) {
      state.goalTab = p.name === "Health" || p.name === "Career" || p.name === "Growth" ? p.name : "All Goals";
      state.goalView = "targets";
      render();
    }
  }
});

document.addEventListener("change", (e) => {
  if (e.target.dataset && e.target.dataset.act === "quarter") {
    state.goalQuarter = e.target.value;
    render();
    toast(`Showing ${state.goalQuarter}`, "calendar");
  }
});
