/* ==========================================================================
   Hearth — core shell: router, sidebar, theme, overlays, toasts
   ========================================================================== */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const VIEWS = {};
const ROUTES = ["chat", "goals", "calendar", "tasks", "memory", "files"];

const viewEl = $("#view");
const layerEl = $("#layer");
const appEl = $("#app");

/* ------------------------------- theme ------------------------------- */

const media = window.matchMedia("(prefers-color-scheme: dark)");

function applyTheme() {
  const resolved = state.theme === "system" ? (media.matches ? "dark" : "light") : state.theme;
  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.setAttribute("data-theme-opt", state.theme);
  $$(".theme-btn").forEach((b) => b.classList.toggle("is-active", b.dataset.themeOpt === state.theme));
}

media.addEventListener("change", () => {
  if (state.theme === "system") applyTheme();
});

/* ------------------------------- routing ------------------------------- */

function currentRoute() {
  const hash = (location.hash || "").replace(/^#\/?/, "").split("?")[0];
  return ROUTES.includes(hash) ? hash : "chat";
}

function go(route, opts = {}) {
  if (route === state.route && !opts.force) {
    render();
    return;
  }
  state.prevRoute = state.route;
  state.route = route;
  if (opts.replace) location.replace(`#/${route}`);
  else location.hash = `#/${route}`;
  if (!opts.silent) render();
}

function render() {
  const fn = VIEWS[state.route] || VIEWS.chat;
  viewEl.innerHTML = fn();
  viewEl.scrollTop = 0;
  renderNav();
  renderTopbar();
  if (state.route === "chat" && typeof bindChat === "function") bindChat();
  if (state.route === "goals" && typeof bindGoals === "function") bindGoals();
  if (state.route === "files" && typeof bindFiles === "function") bindFiles();
  if (state.route === "tasks" && typeof bindTasks === "function") bindTasks();
  persist();
}

/* ------------------------------- sidebar ------------------------------- */

function renderNav() {
  const nav = $("#navMain");
  if (!nav) return;
  nav.innerHTML = NAV.map((item) => {
    const active = state.route === item.id;
    const badge = item.id === "tasks" ? state.tasks.length : item.id === "calendar" ? 8 : item.badge;
    return `<a href="#/${item.id}" class="${active ? "is-active" : ""}" data-act="nav" data-route="${item.id}" title="${item.label}">
      ${ic(item.icon, 16)}
      <span class="nav-label">${item.label}</span>
      ${item.kbd ? `<span class="nav-keys"><span>${esc(item.kbd.replace("⌘", "⌘"))}</span></span>` : ""}
      ${badge ? `<span class="nav-badge">${badge}</span>` : ""}
    </a>`;
  }).join("");

  const today = $("#todayList");
  if (today) {
    today.innerHTML = TODAY_PROMPTS.map(
      (p) => `<li data-act="today" data-prompt="${esc(p)}" class="${state.doneToday.includes(p) ? "is-done" : ""}">${esc(p)}</li>`
    ).join("");
  }

  const setList = $("#settingList");
  if (setList) {
    setList.innerHTML = SETTING_ITEMS.map(
      (s) => `<li data-act="setting" data-id="${s.id}" class="${state.activeSetting === s.id ? "is-active" : ""}">${s.label}</li>`
    ).join("");
  }

  const helpList = $("#helpList");
  if (helpList) {
    helpList.innerHTML = HELP_ITEMS.map(
      (h) => `<li data-act="help" data-id="${h.id}" class="${state.activeHelp === h.id ? "is-active" : ""}">${h.label}</li>`
    ).join("");
  }
}

function renderTopbar() {
  const osLabel = $("#osLabel");
  if (osLabel) osLabel.textContent = state.os;

  const back = $("#btnBack");
  const backLabel = $("#backLabel");
  if (back && backLabel) {
    if (state.route === "chat") {
      back.hidden = true;
    } else {
      back.hidden = false;
      const prev = NAV.find((n) => n.id === state.prevRoute);
      backLabel.textContent = prev ? prev.label : "Chat";
    }
  }

  const bell = $("#btnBell");
  if (bell) {
    const unread = state.notifications.some((n) => n.unread);
    bell.classList.toggle("has-unread", unread);
    bell.setAttribute("aria-expanded", layerEl.dataset.menu === "bell" ? "true" : "false");
  }
  const osBtn = $("#btnOs");
  if (osBtn) osBtn.setAttribute("aria-expanded", layerEl.dataset.menu === "os" ? "true" : "false");
}

/* ------------------------------- toasts ------------------------------- */

function toast(message, icon = "check") {
  const host = $("#toasts");
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `${ic(icon, 13)}<span>${esc(message)}</span>`;
  host.appendChild(el);
  setTimeout(() => {
    el.classList.add("is-out");
    setTimeout(() => el.remove(), 220);
  }, 2200);
}

/* ------------------------------- overlays ------------------------------- */

let layerCleanup = null;
let suppressNextClick = false;

function closeLayer() {
  layerEl.hidden = true;
  layerEl.className = "layer";
  layerEl.innerHTML = "";
  layerEl.dataset.menu = "";
  document.removeEventListener("keydown", layerKeyHandler, true);
  if (layerCleanup) {
    layerCleanup();
    layerCleanup = null;
  }
}

/* Backdrop click closes whatever overlay is open — and must not also trigger
   the element underneath, hence the one-shot click suppression. */
layerEl.addEventListener("mousedown", (e) => {
  if (e.target === layerEl) {
    suppressNextClick = true;
    closeLayer();
  }
});

document.addEventListener(
  "click",
  (e) => {
    if (!suppressNextClick) return;
    suppressNextClick = false;
    e.preventDefault();
    e.stopPropagation();
  },
  true
);

function layerKeyHandler(e) {
  if (e.key === "Escape") {
    e.stopPropagation();
    closeLayer();
  }
}

function openLayer(html, opts = {}) {
  closeLayer();
  layerEl.hidden = false;
  layerEl.className = opts.plain ? "layer layer-plain" : "layer";
  layerEl.innerHTML = html;
  layerEl.dataset.menu = opts.name || "";
  document.addEventListener("keydown", layerKeyHandler, true);
  if (opts.onClose) layerCleanup = opts.onClose;
  if (opts.focus) {
    const f = layerEl.querySelector(opts.focus);
    if (f) setTimeout(() => f.focus(), 30);
  }
  return layerEl;
}

/** Dropdown menu anchored to an element. */
function openMenu(anchor, items, opts = {}) {
  const rect = anchor.getBoundingClientRect();
  const menu = document.createElement("div");
  menu.className = "menu";
  menu.innerHTML = items
    .map((it) => {
      if (it.type === "sep") return '<div class="menu-sep"></div>';
      if (it.type === "label") return `<div class="menu-label">${esc(it.label)}</div>`;
      return `<button class="menu-item ${it.danger ? "is-danger" : ""}" data-menu-id="${it.id}">
        ${it.icon ? ic(it.icon, 15) : ""}
        <span>${esc(it.label)}</span>
        ${it.kbd ? `<span class="kbd">${esc(it.kbd)}</span>` : ""}
        ${it.checked ? ic("check", 14) : ""}
      </button>`;
    })
    .join("");

  openLayer("", { plain: true, name: opts.name || "menu" });
  layerEl.appendChild(menu);

  const mw = Math.max(menu.offsetWidth, 190);
  let left = opts.align === "right" ? rect.right - mw : rect.left;
  left = Math.max(10, Math.min(left, window.innerWidth - mw - 10));
  let top = rect.bottom + 6;
  if (top + menu.offsetHeight > window.innerHeight - 10) top = Math.max(10, rect.top - menu.offsetHeight - 6);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  menu.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-menu-id]");
    if (!btn) return;
    closeLayer();
    const item = items.find((i) => i.id === btn.dataset.menuId);
    if (item && item.onSelect) item.onSelect();
  });
  return menu;
}

/** Centered modal dialog. */
function openModal({ title, body, footer, onMount, width }) {
  openLayer(
    `<div class="modal" ${width ? `style="width:min(${width}px, calc(100vw - 32px))"` : ""} role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head">
        <h3>${esc(title)}</h3>
        <button class="icon-btn" data-act="close-layer" aria-label="Close">${ic("close", 16)}</button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ""}
    </div>`,
    { name: "modal", focus: "[data-autofocus]" }
  );
  if (onMount) onMount(layerEl);
  return layerEl;
}

/** Right-side drawer. */
function openDrawer({ title, body, onMount }) {
  openLayer(
    `<aside class="drawer" role="dialog" aria-label="${esc(title)}">
      <div class="drawer-head">
        <h3>${esc(title)}</h3>
        <button class="icon-btn" data-act="close-layer" aria-label="Close">${ic("close", 16)}</button>
      </div>
      <div class="drawer-body">${body}</div>
    </aside>`,
    { name: "drawer" }
  );
  if (onMount) onMount(layerEl);
  return layerEl;
}

/* ------------------------------- command palette ------------------------------- */

function searchIndex() {
  const out = [];
  NAV.forEach((n) => out.push({ group: "Navigate", label: n.label, icon: n.icon, run: () => go(n.id) }));
  SETTING_ITEMS.forEach((s) => out.push({ group: "Settings", label: s.label, icon: "layers", run: () => openSetting(s.id) }));
  HELP_ITEMS.forEach((h) => out.push({ group: "Help", label: h.label, icon: "bulb", run: () => openHelp(h.id) }));
  state.goals.forEach((g) => out.push({ group: "Goals", label: g.name, icon: g.icon, run: () => go("goals") }));
  state.vision.forEach((v) => out.push({ group: "Vision", label: v.title, icon: "sparkle2", run: () => go("goals") }));
  state.files.forEach((f) => out.push({ group: "Files", label: f.name, icon: f.icon, run: () => go("files") }));
  state.recent.forEach((f) => out.push({ group: "Recent files", label: f.name, icon: f.icon, run: () => go("files") }));
  state.tasks.forEach((t) => out.push({ group: "Tasks", label: t.title, icon: "tasks", run: () => go("tasks") }));
  TODAY_PROMPTS.forEach((p) => out.push({ group: "Prompts", label: p, icon: "sparkle", run: () => startPrompt(p) }));
  return out;
}

let cmdkIndex = 0;
let cmdkResults = [];

function openCmdk(initial = "") {
  const idx = searchIndex();
  openLayer(
    `<div class="cmdk" role="dialog" aria-label="Command palette">
      <div class="cmdk-input">
        ${ic("search", 16)}
        <input id="cmdkInput" placeholder="Search pages, files, tasks, goals…" value="${esc(initial)}" autocomplete="off" spellcheck="false" />
        <span class="kbd">esc</span>
      </div>
      <div class="cmdk-results" id="cmdkResults"></div>
    </div>`,
    { name: "cmdk", focus: "#cmdkInput" }
  );

  const input = $("#cmdkInput");
  const results = $("#cmdkResults");

  const paint = (q) => {
    const needle = q.trim().toLowerCase();
    cmdkResults = needle
      ? idx.filter((i) => i.label.toLowerCase().includes(needle))
      : idx.slice(0, 12);
    cmdkIndex = 0;
    if (!cmdkResults.length) {
      results.innerHTML = '<div class="cmdk-empty">No matches. Try a different keyword.</div>';
      return;
    }
    let html = "";
    let group = null;
    cmdkResults.forEach((r, i) => {
      if (r.group !== group) {
        group = r.group;
        html += `<div class="cmdk-group">${esc(group)}</div>`;
      }
      html += `<button class="cmdk-item ${i === 0 ? "is-sel" : ""}" data-cmdk="${i}">${ic(r.icon, 15)}<span>${esc(r.label)}</span></button>`;
    });
    results.innerHTML = html;
  };

  paint(initial);

  input.addEventListener("input", () => paint(input.value));

  results.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-cmdk]");
    if (!btn) return;
    const item = cmdkResults[Number(btn.dataset.cmdk)];
    closeLayer();
    if (item) item.run();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      cmdkIndex = (cmdkIndex + (e.key === "ArrowDown" ? 1 : -1) + cmdkResults.length) % cmdkResults.length;
      $$(".cmdk-item", results).forEach((el, i) => el.classList.toggle("is-sel", i === cmdkIndex));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = cmdkResults[cmdkIndex];
      closeLayer();
      if (item) item.run();
    }
  });
}

/* ------------------------------- settings & help panels ------------------------------- */

function openSetting(id) {
  state.activeSetting = id;
  renderNav();
  const def = SETTING_ITEMS.find((s) => s.id === id) || SETTING_ITEMS[0];
  const s = state.settings;
  const rows = {
    general: `
      <div class="setting-row"><div class="sr-txt"><b>Language</b><span>Interface language</span></div>
        <select class="select" style="height:28px"><option>English</option><option>简体中文</option><option>日本語</option></select></div>
      <div class="setting-row"><div class="sr-txt"><b>Week starts on</b><span>Calendar and goals</span></div>
        <select class="select" style="height:28px"><option>Monday</option><option>Sunday</option></select></div>
      <div class="setting-row"><div class="sr-txt"><b>Default workspace</b><span>Opened on launch</span></div>
        <select class="select" style="height:28px"><option>Personal OS</option><option>Work OS</option></select></div>
      <div class="setting-row"><div class="sr-txt"><b>Compact density</b><span>Tighter lists and cards</span></div>
        <button class="switch ${s.compact ? "is-on" : ""}" data-act="toggle-setting" data-key="compact" role="switch" aria-checked="${s.compact}"></button></div>`,
    appearance: `
      <div class="setting-row"><div class="sr-txt"><b>Theme</b><span>Light, dark or follow the system</span></div>
        <select class="select" style="height:28px" data-act="set-theme">
          <option value="light" ${state.theme === "light" ? "selected" : ""}>Light</option>
          <option value="dark" ${state.theme === "dark" ? "selected" : ""}>Dark</option>
          <option value="system" ${state.theme === "system" ? "selected" : ""}>System</option>
        </select></div>
      <div class="setting-row"><div class="sr-txt"><b>Reduce motion</b><span>Disable animated transitions</span></div>
        <button class="switch ${s.reduceMotion ? "is-on" : ""}" data-act="toggle-setting" data-key="reduceMotion" role="switch" aria-checked="${s.reduceMotion}"></button></div>
      <div class="setting-row"><div class="sr-txt"><b>Accent color</b><span>Used for highlights and charts</span></div>
        <select class="select" style="height:28px"><option>Violet</option><option>Blue</option><option>Emerald</option></select></div>`,
    account: `
      <div class="setting-row"><div class="sr-txt"><b>RahMan</b><span>viratman02@gmail.com</span></div><span class="tag tag-violet">Pro</span></div>
      <div class="setting-row"><div class="sr-txt"><b>Storage</b><span>130 GB of 200 GB used</span></div>
        <button class="btn btn-ghost btn-sm" data-act="go-files">Manage</button></div>
      <div class="setting-row"><div class="sr-txt"><b>Two-factor</b><span>Protect your account</span></div>
        <button class="switch" role="switch" aria-checked="false"></button></div>
      <div class="setting-row"><div class="sr-txt"><b>Sign out</b><span>End this session on this device</span></div>
        <button class="btn btn-ghost btn-sm" data-act="sign-out">Sign out</button></div>`,
    privacy: `
      <div class="setting-row"><div class="sr-txt"><b>Memory capture</b><span>Let Hearth remember useful context</span></div>
        <button class="switch ${s.memoryCapture ? "is-on" : ""}" data-act="toggle-setting" data-key="memoryCapture" role="switch" aria-checked="${s.memoryCapture}"></button></div>
      <div class="setting-row"><div class="sr-txt"><b>Auto-archive</b><span>Move finished tasks to the archive</span></div>
        <button class="switch ${s.autoArchive ? "is-on" : ""}" data-act="toggle-setting" data-key="autoArchive" role="switch" aria-checked="${s.autoArchive}"></button></div>
      <div class="setting-row"><div class="sr-txt"><b>Export my data</b><span>Download everything Hearth knows</span></div>
        <button class="btn btn-ghost btn-sm" data-act="export">Export</button></div>`,
    shortcuts: `
      <div class="setting-row"><div class="sr-txt"><b>Command palette</b><span>Search everything</span></div><span class="kbd">⌘K</span></div>
      <div class="setting-row"><div class="sr-txt"><b>New chat</b><span>Start a conversation</span></div><span class="kbd">⌘T</span></div>
      <div class="setting-row"><div class="sr-txt"><b>Send message</b><span>From the composer</span></div><span class="kbd">Enter</span></div>
      <div class="setting-row"><div class="sr-txt"><b>Toggle theme</b><span>Light / dark</span></div><span class="kbd">⌘J</span></div>`,
    billing: `
      <div class="setting-row"><div class="sr-txt"><b>Plan</b><span>Hearth Pro — renews Mar 12</span></div><span class="tag tag-green">Active</span></div>
      <div class="setting-row"><div class="sr-txt"><b>AI usage</b><span>1,284 of 2,000 responses this month</span></div>
        <button class="btn btn-ghost btn-sm" data-act="noop">Upgrade</button></div>`,
  };

  openDrawer({
    title: def.label,
    body: `<div class="setting-row" style="border:0;padding-top:0"><div class="sr-txt"><b>${esc(def.label)}</b><span>Preferences are saved on this device.</span></div></div>${rows[def.id] || rows.general}`,
  });
}

function openHelp(id) {
  state.activeHelp = id;
  renderNav();
  const def = HELP_ITEMS.find((h) => h.id === id) || HELP_ITEMS[0];
  const body = {
    start: `<p class="muted" style="font-size:12px;line-height:1.7;margin-top:0">Hearth is one surface for chat, goals, files and tasks. Start with the composer on the Chat page, or pick one of the prompts under <b>Today</b> in the sidebar.</p>
      <div class="panel" style="margin-top:12px"><b style="font-size:12px">Three things to try</b>
      <ol style="font-size:11.5px;color:var(--ink-3);line-height:1.8;padding-left:18px;margin:8px 0 0">
        <li>Ask “Plan my Q3 priorities” — the answer streams in and becomes tasks.</li>
        <li>Open Goals and switch the W1/W2/W3 dial on a target.</li>
        <li>Drop a file onto Files and watch Hearth group it semantically.</li>
      </ol></div>`,
    faq: `<p class="muted" style="font-size:12px;line-height:1.75;margin-top:0"><b style="color:var(--ink)">Is my data uploaded?</b><br/>This build is front-end only — nothing leaves your device. A backend is not connected yet.<br/><br/>
      <b style="color:var(--ink)">Can I import my own files?</b><br/>Yes, use the + button in the composer or the Files page search bar.<br/><br/>
      <b style="color:var(--ink)">Why is the AI response simulated?</b><br/>Hearth streams a scripted-but-contextual reply so every interaction can be explored offline.</p>`,
    contact: `<div class="panel"><b style="font-size:12.5px">Reach the team</b>
      <p class="muted" style="font-size:11.5px;margin:8px 0 12px;line-height:1.6">We answer within one business day.</p>
      <button class="btn btn-dark btn-sm" data-act="noop">Send a message</button>
      <button class="btn btn-ghost btn-sm" data-act="noop">Email support</button></div>`,
    shortcuts: `<div class="setting-row"><div class="sr-txt"><b>Command palette</b></div><span class="kbd">⌘K</span></div>
      <div class="setting-row"><div class="sr-txt"><b>New chat</b></div><span class="kbd">⌘T</span></div>
      <div class="setting-row"><div class="sr-txt"><b>Toggle theme</b></div><span class="kbd">⌘J</span></div>
      <div class="setting-row"><div class="sr-txt"><b>Escape</b><span>Close any overlay</span></div><span class="kbd">Esc</span></div>`,
  }[def.id];

  openDrawer({ title: def.label, body });
}

/* ------------------------------- new menu ------------------------------- */

function openNewMenu(anchor) {
  openMenu(
    anchor,
    [
      { type: "label", label: "Create" },
      { id: "chat", label: "New chat", icon: "chat", onSelect: () => { state.chat.messages = []; go("chat"); toast("New conversation started", "sparkle"); } },
      { id: "task", label: "New task", icon: "tasks", onSelect: () => openTaskModal() },
      { id: "goal", label: "New goal", icon: "goals", onSelect: () => openGoalModal() },
      { id: "note", label: "New note", icon: "file", onSelect: () => openNoteModal() },
      { id: "memory", label: "New memory", icon: "memory", onSelect: () => openMemoryModal() },
      { type: "sep" },
      { id: "event", label: "New event", icon: "calendarPlus", onSelect: () => openEventModal() },
      { id: "upload", label: "Upload a file", icon: "cloudUp", onSelect: () => { go("files"); toast("Drop files anywhere on the Files page", "cloudUp"); } },
    ],
    { align: "right", name: "new" }
  );
}

/* ------------------------------- global events ------------------------------- */

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;

  switch (act) {
    case "nav":
      e.preventDefault();
      go(el.dataset.route);
      appEl.classList.remove("is-open");
      break;
    case "today":
      startPrompt(el.dataset.prompt);
      break;
    case "setting":
      openSetting(el.dataset.id);
      break;
    case "help":
      openHelp(el.dataset.id);
      break;
    case "close-layer":
      closeLayer();
      break;
    case "go-files":
      closeLayer();
      go("files");
      break;
    case "sign-out":
      closeLayer();
      toast("Signed out of this demo session", "lock2");
      break;
    case "export":
      toast("Export queued — 42 items", "download");
      break;
    case "noop":
      toast("This action is not wired to a backend yet", "bulb");
      break;
    case "toggle-setting": {
      const key = el.dataset.key;
      state.settings[key] = !state.settings[key];
      el.classList.toggle("is-on", state.settings[key]);
      el.setAttribute("aria-checked", String(state.settings[key]));
      if (key === "reduceMotion") document.documentElement.toggleAttribute("data-reduce-motion", state.settings[key]);
      persist();
      toast(`${key === "reduceMotion" ? "Reduce motion" : "Preference"} ${state.settings[key] ? "on" : "off"}`, "check");
      break;
    }
    default:
      break;
  }
});

/* theme buttons */
$$(".theme-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.theme = btn.dataset.themeOpt;
    applyTheme();
    persist();
    toast(`${btn.textContent.trim()} theme`, "sun");
  });
});

/* sidebar collapse */
$("#btnCollapse").addEventListener("click", () => {
  state.rail = !state.rail;
  appEl.classList.toggle("is-rail", state.rail);
  persist();
});

/* group toggles */
function bindGroupToggle(btnId, listId, key) {
  const btn = $(btnId);
  if (!btn) return;
  const initial = state.openGroups[key] !== false;
  btn.setAttribute("aria-expanded", String(initial));
  const list = $(listId);
  if (list) list.style.display = initial ? "" : "none";
  btn.addEventListener("click", () => {
    const open = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", String(!open));
    const el = $(listId);
    if (el) el.style.display = open ? "none" : "";
    state.openGroups[key] = !open;
    persist();
  });
}
bindGroupToggle("#toggleToday", "#todayList", "today");
bindGroupToggle("#toggleSetting", "#settingList", "setting");
bindGroupToggle("#toggleHelp", "#helpList", "help");

/* topbar buttons */
function openNotifications() {
  openDrawer({
    title: "Notifications",
    body: `<div style="display:flex;gap:8px;margin-bottom:12px">
        <button class="btn btn-ghost btn-sm" data-act="mark-all-read">Mark all read</button>
        <button class="btn btn-soft btn-sm" data-act="clear-notifs">Clear</button>
      </div>
      ${
        state.notifications.length
          ? state.notifications
              .map(
                (n) => `<div class="notif ${n.unread ? "" : "is-read"}">
            <span class="notif-dot"></span>
            <div><b>${esc(n.title)}</b><p>${esc(n.body)}</p><time>${esc(n.time)}</time></div>
          </div>`
              )
              .join("")
          : '<div class="empty">No notifications yet.</div>'
      }`,
  });
}

$("#btnBell").addEventListener("click", (e) => {
  e.stopPropagation();
  openNotifications();
});

$("#btnNew").addEventListener("click", (e) => {
  e.stopPropagation();
  openNewMenu(e.currentTarget);
});

$("#btnOs").addEventListener("click", (e) => {
  e.stopPropagation();
  openMenu(
    e.currentTarget,
    OS_PROFILES.map((p) => ({
      id: p,
      label: p,
      icon: "layers",
      checked: state.os === p,
      onSelect: () => {
        state.os = p;
        renderTopbar();
        toast(`Switched to ${p}`, "layers");
      },
    })),
    { name: "os" }
  );
});

$("#btnBack").addEventListener("click", () => {
  go(state.prevRoute || "chat");
});

$("#btnSliders").addEventListener("click", (e) => {
  e.stopPropagation();
  openSetting("appearance");
});

$("#btnMenu").addEventListener("click", () => {
  appEl.classList.toggle("is-open");
});

$("#scrim").addEventListener("click", () => appEl.classList.remove("is-open"));

/* user menu */
$("#sbUser").addEventListener("click", (e) => {
  e.stopPropagation();
  openMenu(
    e.currentTarget,
    [
      { id: "profile", label: "Profile", icon: "users", onSelect: () => openSetting("account") },
      { id: "workspace", label: "Switch workspace", icon: "layers", onSelect: () => openSetting("general") },
      { id: "prefs", label: "Preferences", icon: "layers", onSelect: () => openSetting("appearance") },
      { type: "sep" },
      { id: "signout", label: "Sign out", icon: "lock2", danger: true, onSelect: () => toast("Signed out of this demo session", "lock2") },
    ],
    { align: "right", name: "user" }
  );
});

/* global search input focuses the palette */
$("#globalSearch").addEventListener("focus", () => {
  openCmdk($("#globalSearch").value);
});
$("#globalSearch").addEventListener("click", (e) => e.stopPropagation());

/* keyboard shortcuts */
document.addEventListener("keydown", (e) => {
  const meta = e.metaKey || e.ctrlKey;
  if (meta && e.key.toLowerCase() === "k") {
    e.preventDefault();
    openCmdk();
  } else if (meta && e.key.toLowerCase() === "t") {
    e.preventDefault();
    state.chat.messages = [];
    go("chat");
    toast("New conversation started", "sparkle");
  } else if (meta && e.key.toLowerCase() === "j") {
    e.preventDefault();
    state.theme = state.theme === "dark" ? "light" : "dark";
    applyTheme();
    persist();
  } else if (meta && e.key.toLowerCase() === "n") {
    e.preventDefault();
    openNewMenu($("#btnNew"));
  }
});

/* --------------------------- notification actions --------------------------- */
document.addEventListener("click", (e) => {
  const act = e.target.closest("[data-act]");
  if (!act) return;
  if (act.dataset.act === "mark-all-read") {
    state.notifications.forEach((n) => (n.unread = false));
    renderTopbar();
    openNotifications();
    toast("All notifications marked as read", "check");
  }
  if (act.dataset.act === "clear-notifs") {
    state.notifications = [];
    renderTopbar();
    closeLayer();
    toast("Notifications cleared", "archive");
  }
});

/* --------------------------- prompt launcher --------------------------- */
function startPrompt(prompt) {
  state.chat.messages = [];
  go("chat");
  setTimeout(() => {
    const ta = $("#chatInput");
    if (ta) {
      ta.value = prompt;
      ta.dispatchEvent(new Event("input"));
      ta.focus();
    }
  }, 60);
}
