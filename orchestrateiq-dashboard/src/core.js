;/* ==== core.js ==== */
(function () {
  const D = window.OIQ_DATA;
  const icon = (n, s, sw) => window.__ICON_LIB.icon(n, s, sw);

  const Q = new URLSearchParams(location.search);
  const FREEZE = Q.get('freeze') === '1';

  const OIQ = {
    version: '1.0.0',
    freeze: FREEZE,
    state: { theme: 'light', traceQuery: '', selectedSpan: null, fixApplied: false, recDismissed: false, newTraces: 0, range: '30 min', live: true },
    pages: {},
    listeners: {},
    on(evt, cb) { (this.listeners[evt] = this.listeners[evt] || []).push(cb); return () => { this.listeners[evt] = this.listeners[evt].filter((f) => f !== cb); }; },
    emit(evt, ...a) { (this.listeners[evt] || []).forEach((cb) => { try { cb(...a); } catch (e) { __errs.push(['emit', evt, String(e)]); } }); },
    icon,
    data: D,
    registerPage(id, def) { this.pages[id] = def; },
    go(hash) { location.hash = hash; },
  };
  window.OIQ = OIQ;
  window.__errs = window.__errs || [];
  window.addEventListener('error', (e) => __errs.push(['error', String(e.message), e.filename + ':' + e.lineno]));
  window.addEventListener('unhandledrejection', (e) => __errs.push(['rejection', String(e.reason && e.reason.stack || e.reason)]));

  // ---------- theme ----------
  function setTheme(t) {
    OIQ.state.theme = t;
    document.documentElement.dataset.theme = t;
    renderRail(); renderTopnav(); // re-render active states
    OIQ.emit('theme', t);
  }

  // ---------- tiny dom helper ----------
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  OIQ.el = el;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  OIQ.esc = esc;

  // ---------- toast ----------
  function toast(msg, kind = 'info', action) {
    const root = document.getElementById('toast-root');
    const t = el(`<div class="toast ${kind}"><span>${icon(kind === 'success' ? 'check' : kind === 'error' ? 'warning' : kind === 'warn' ? 'warning' : 'spark', 15)}</span><span>${msg}</span>${action ? `<button class="undo">${action.label}</button>` : ''}</div>`);
    const kill = () => { t.classList.add('out'); setTimeout(() => t.remove(), 240); };
    if (action) t.querySelector('.undo').onclick = () => { action.onClick(); kill(); };
    root.appendChild(t);
    setTimeout(kill, action ? 5200 : 3200);
    return kill;
  }
  OIQ.ui = {};
  OIQ.ui.toast = toast;

  // ---------- dropdown ----------
  let openDd = null;
  function closeDd() { if (openDd) { openDd.remove(); openDd = null; document.removeEventListener('mousedown', ddOutside, true); document.removeEventListener('keydown', ddEsc, true); } }
  function ddOutside(e) { if (openDd && !openDd.contains(e.target)) closeDd(); }
  function ddEsc(e) { if (e.key === 'Escape') closeDd(); }
  function dropdown(trigger, items, onSelect, opts = {}) {
    if (openDd) { closeDd(); return; }
    const m = el('<div class="dd-menu"></div>');
    items.forEach((it) => {
      if (it === 'sep') { m.appendChild(el('<div class="dd-sep"></div>')); return; }
      if (it.head) { m.appendChild(el(`<div class="dd-head lbl">${it.head}</div>`)); return; }
      const b = el(`<button class="dd-item ${it.danger ? 'danger' : ''}">${it.icon ? icon(it.icon, 16) : ''}<span class="grow">${it.label}</span>${it.checked ? `<span class="check">${icon('check', 15)}</span>` : ''}</button>`);
      b.onclick = () => { closeDd(); onSelect && onSelect(it); };
      m.appendChild(b);
    });
    document.body.appendChild(m);
    const r = trigger.getBoundingClientRect();
    m.style.top = r.bottom + 8 + 'px';
    const mw = m.offsetWidth;
    let left = (opts.align === 'left') ? r.left : r.right - mw;
    left = Math.max(10, Math.min(left, innerWidth - mw - 10));
    m.style.left = left + 'px';
    if (r.bottom + m.offsetHeight > innerHeight - 10) m.style.top = Math.max(10, r.top - m.offsetHeight - 8) + 'px';
    openDd = m;
    setTimeout(() => {
      document.addEventListener('mousedown', ddOutside, true);
      document.addEventListener('keydown', ddEsc, true);
    });
  }
  OIQ.ui.dropdown = dropdown;
  OIQ.ui.closeDd = closeDd;

  // ---------- modal ----------
  function modal({ title, body, actions = [], wide, onClose }) {
    const ov = el('<div class="modal-overlay"></div>');
    const m = el(`<div class="modal ${wide ? 'wide' : ''}"></div>`);
    const head = el(`<div class="modal-head"><h3>${title}</h3><button class="modal-x">${icon('x', 17)}</button></div>`);
    m.appendChild(head);
    if (body) m.appendChild(typeof body === 'string' ? el(`<div>${body}</div>`) : body);
    if (actions.length) {
      const row = el('<div class="modal-actions"></div>');
      actions.forEach((a) => {
        const b = el(`<button class="${a.kind === 'primary' ? 'btn-primary' : 'pill-btn gray'}">${a.label}</button>`);
        b.onclick = () => { const r = a.onClick && a.onClick(m); if (r !== false) close(); };
        row.appendChild(b);
      });
      m.appendChild(row);
    }
    ov.appendChild(m);
    function close() { ov.remove(); document.removeEventListener('keydown', onKey, true); onClose && onClose(); }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
    head.querySelector('.modal-x').onclick = close;
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
    document.addEventListener('keydown', onKey, true);
    document.getElementById('modal-root').appendChild(ov);
    return close;
  }
  OIQ.ui.modal = modal;
  function confirm({ title, message, danger, okLabel = 'Confirm' }) {
    return new Promise((res) => {
      let done = false;
      modal({
        title, body: `<p style="color:var(--ink2);font-size:14px">${message}</p>`,
        actions: [
          { label: 'Cancel', onClick: () => { done = false; } },
          { label: okLabel, kind: 'primary', onClick: () => { done = true; } },
        ],
        onClose: () => res(done),
      });
    });
  }
  OIQ.ui.confirm = confirm;

  // ---------- tooltip ----------
  let tipEl = null;
  function tooltip(target, htmlFn) {
    const show = (e) => {
      if (!tipEl) { tipEl = el('<div class="tip"></div>'); document.body.appendChild(tipEl); }
      tipEl.innerHTML = htmlFn(e);
      tipEl.style.opacity = '1';
      const r = target.getBoundingClientRect();
      tipEl.style.left = Math.min(e.clientX || r.left, innerWidth - tipEl.offsetWidth - 12) + 'px';
      tipEl.style.top = (r.top - tipEl.offsetHeight - 10) + 'px';
    };
    const move = (e) => { if (tipEl) { tipEl.style.left = Math.min(e.clientX, innerWidth - tipEl.offsetWidth - 12) + 'px'; } };
    const hide = () => { if (tipEl) { tipEl.remove(); tipEl = null; } };
    target.addEventListener('mouseenter', show);
    target.addEventListener('mousemove', move);
    target.addEventListener('mouseleave', hide);
    return hide;
  }
  OIQ.ui.tooltip = tooltip;

  // ---------- topnav ----------
  const NAV = [['overview', 'Overview'], ['workflows', 'Workflows'], ['livemap', 'Live Map'], ['traces', 'Traces'], ['incidents', 'Incidents'], ['insights', 'Insights']];
  function renderTopnav() {
    const nav = document.getElementById('topnav');
    if (!nav) return;
    const route = OIQ.state.route || {};
    const active = route.page === 'trace' ? 'traces' : route.page;
    nav.innerHTML = '';
    nav.appendChild(el(`<div class="brand"><span class="logo-tile">${icon('logo', 19)}</span>OrchestrateIQ</div>`));
    const pn = el('<nav class="pagenav"></nav>');
    NAV.forEach(([id, label]) => {
      const b = el(`<button class="${active === id ? 'active' : ''}">${label}</button>`);
      b.onclick = () => OIQ.go('#/' + id);
      pn.appendChild(b);
    });
    nav.appendChild(pn);
    const right = el('<div class="nav-right"></div>');
    // live badge
    const live = el(`<button class="live-badge ${OIQ.state.live ? '' : 'paused'}" title="Live streaming ${OIQ.state.live ? 'on' : 'paused'}"><span class="dot-live"></span>Live</button>`);
    live.onclick = () => {
      OIQ.state.live = !OIQ.state.live;
      OIQ.emit('live', OIQ.state.live);
      renderTopnav();
      toast(OIQ.state.live ? 'Live streaming resumed' : 'Live streaming paused', OIQ.state.live ? 'success' : 'warn');
    };
    right.appendChild(live);
    // range
    const rangeWrap = el('<div class="nav-pill"></div>');
    const rangeBtn = el(`<button class="range-btn" style="display:flex;align-items:center;gap:8px">${icon('calendar', 16)}<span id="range-label">${OIQ.state.range}</span>${icon('chevron-down', 15)}</button>`);
    rangeBtn.onclick = () => dropdown(rangeBtn, [
      { head: 'Time range' }, ...['15 min', '30 min', '1 h', '24 h'].map((v) => ({ label: v, value: v, checked: OIQ.state.range === v })),
    ], (it) => {
      OIQ.state.range = it.value;
      rangeBtn.querySelector('#range-label').textContent = it.value;
      OIQ.emit('range', it.value);
    });
    rangeWrap.appendChild(rangeBtn);
    right.appendChild(rangeWrap);
    // search
    const searchBtn = el(`<button class="icon-btn" title="Search (⌘K)">${icon('search', 18)}</button>`);
    searchBtn.onclick = () => openCmdk();
    right.appendChild(searchBtn);
    // bell
    const bellBtn = el(`<button class="icon-btn" title="Notifications">${icon('bell', 18)}<span class="notif-dot"></span></button>`);
    bellBtn.onclick = () => {
      if (openDd) { closeDd(); return; }
      const p = el('<div class="notif-panel"><div class="dd-head lbl" style="display:flex;justify-content:space-between;align-items:center">Notifications<span class="badge-red badge" style="padding:2px 9px;font-size:11px">' + D.incidents.filter(i => i.sev === 'critical').length + ' critical</span></div></div>');
      D.notifs.forEach((n) => {
        const row = el(`<div class="notif-row"><span class="dot dot-${n.tone}" style="margin-top:6px"></span><div><b>${n.title}</b><span>${n.sub}</span></div></div>`);
        row.onclick = () => { closeDd(); if (n.go) OIQ.go(n.go); };
        p.appendChild(row);
      });
      const foot = el('<button class="dd-item" style="justify-content:center;color:var(--blue);font-weight:600">View all incidents</button>');
      foot.onclick = () => { closeDd(); OIQ.go('#/incidents'); };
      p.appendChild(foot);
      document.body.appendChild(p);
      const r = bellBtn.getBoundingClientRect();
      p.style.top = r.bottom + 10 + 'px';
      p.style.left = Math.max(10, r.right - p.offsetWidth) + 'px';
      openDd = p;
      setTimeout(() => {
        document.addEventListener('mousedown', ddOutside, true);
        document.addEventListener('keydown', ddEsc, true);
      });
    };
    right.appendChild(bellBtn);
    // avatar
    const av = el(`<button class="avatar-btn"><span class="avatar"></span><div><b>${D.me.team}</b><span>${D.me.role}</span></div>${icon('chevron-down', 15)}</button>`);
    av.onclick = () => dropdown(av, [
      { head: D.me.team + ' · ' + D.me.role.split('·')[0].trim() },
      { label: 'Profile & team', icon: 'person', value: 'profile' },
      { label: 'Workspace settings', icon: 'gear', value: 'settings' },
      { label: 'API keys', icon: 'braces', value: 'keys' },
      'sep',
      { label: 'Sign out', icon: 'logout', value: 'logout', danger: true },
    ], async (it) => {
      if (it.value === 'settings') openSettings();
      else if (it.value === 'logout') {
        const ok = await confirm({ title: 'Sign out', message: 'Sign out of OrchestrateIQ? Demo data will stay on this device.', okLabel: 'Sign out', danger: true });
        if (ok) toast('Signed out (demo) — refreshing…', 'success');
      } else toast(it.label + ' — demo placeholder', 'info');
    });
    right.appendChild(av);
    nav.appendChild(right);
  }

  // ---------- rail ----------
  const RAIL_MAIN = [['dashboard', 'Overview', 'overview'], ['robot', 'Workflows', 'workflows'], ['dollar', 'Insights', 'insights'], ['wrench', 'Traces', 'traces'], ['plug', 'Live Map', 'livemap'], ['gear', 'Settings', '@settings']];
  function renderRail() {
    const rail = document.getElementById('rail');
    if (!rail) return;
    rail.innerHTML = '';
    const theme = OIQ.state.theme;
    const g1 = el('<div class="rail-group"></div>');
    const sun = el(`<button class="rail-btn ${theme === 'light' ? 'active' : ''}" title="Light theme">${icon('sun', 18)}</button>`);
    const moon = el(`<button class="rail-btn ${theme === 'dark' ? 'active' : ''}" title="Dark theme">${icon('moon', 18)}</button>`);
    sun.onclick = () => setTheme('light');
    moon.onclick = () => setTheme('dark');
    g1.appendChild(sun); g1.appendChild(moon);
    rail.appendChild(g1);
    const g2 = el('<div class="rail-group"></div>');
    const route = OIQ.state.route || {};
    RAIL_MAIN.forEach(([ic, title, target]) => {
      // 视频中仪表盘图标恒为高亮态（home 位），其余图标只做 hover
      const active = ic === 'dashboard';
      const b = el(`<button class="rail-btn ${active ? 'active' : ''}" title="${title}">${icon(ic, 19)}</button>`);
      b.onclick = () => target === '@settings' ? openSettings() : OIQ.go('#/' + target);
      g2.appendChild(b);
    });
    rail.appendChild(g2);
    const sp = el('<div class="rail-spacer"></div>');
    rail.appendChild(sp);
    const g3 = el('<div class="rail-group"></div>');
    const help = el(`<button class="rail-btn" title="Help & shortcuts (?)">${icon('help', 19)}</button>`);
    help.onclick = () => openHelp();
    const out = el(`<button class="rail-btn" title="Sign out">${icon('logout', 19)}</button>`);
    out.onclick = async () => {
      const ok = await confirm({ title: 'Sign out', message: 'Sign out of OrchestrateIQ? Demo data will stay on this device.', okLabel: 'Sign out' });
      if (ok) toast('Signed out (demo) — refreshing…', 'success');
    };
    g3.appendChild(help); g3.appendChild(out);
    rail.appendChild(g3);
  }

  // ---------- settings / help modals ----------
  function openSettings() {
    const body = el(`
      <div style="display:flex;flex-direction:column;gap:16px">
        <div>
          <div class="lbl" style="margin-bottom:8px">Appearance</div>
          <div class="tabbar" id="set-theme">
            <button data-t="light" class="${OIQ.state.theme === 'light' ? 'active' : ''}">${'Light'}</button>
            <button data-t="dark" class="${OIQ.state.theme === 'dark' ? 'active' : ''}">Dark</button>
          </div>
        </div>
        <div>
          <div class="lbl" style="margin-bottom:8px">Live streaming</div>
          <button class="pill-btn" id="set-live">${OIQ.state.live ? icon('pause', 15) + ' Pause live trace stream' : icon('play', 15) + ' Resume live trace stream'}</button>
        </div>
        <div>
          <div class="lbl" style="margin-bottom:8px">Workspace</div>
          <div class="kv"><div class="k">Organization</div><div class="v">acme-ai</div><div class="note">Plan: Platform · 186 agents · 42 workflows</div></div>
        </div>
      </div>`);
    body.querySelectorAll('#set-theme button').forEach((b) => b.onclick = () => {
      setTheme(b.dataset.t);
      body.querySelectorAll('#set-theme button').forEach((x) => x.classList.toggle('active', x === b));
    });
    body.querySelector('#set-live').onclick = function () {
      OIQ.state.live = !OIQ.state.live; OIQ.emit('live', OIQ.state.live); renderTopnav();
      this.innerHTML = OIQ.state.live ? icon('pause', 15) + ' Pause live trace stream' : icon('play', 15) + ' Resume live trace stream';
      toast(OIQ.state.live ? 'Live streaming resumed' : 'Live streaming paused', OIQ.state.live ? 'success' : 'warn');
    };
    modal({ title: 'Settings', body, actions: [{ label: 'Done', kind: 'primary' }] });
  }
  function openHelp() {
    modal({
      title: 'Help & shortcuts',
      body: `<div style="display:flex;flex-direction:column;gap:10px;font-size:13.5px;color:var(--ink2)">
        ${[['⌘K / Ctrl K', 'Open command palette'], ['?', 'This dialog'], ['Esc', 'Close menus & dialogs'], ['Click a span', 'Inspect invocation in trace waterfall'], ['Click a node', 'Filter traces by agent from live map']]
          .map(([k, v]) => `<div style="display:flex;justify-content:space-between;gap:20px"><span>${v}</span><span class="kbd">${k}</span></div>`).join('')}
        <div class="callout blue" style="margin-top:6px">${icon('spark', 16)} All data in this demo is synthetic — generated in-browser, nothing leaves your machine.</div>
      </div>`,
      actions: [{ label: 'Got it', kind: 'primary' }],
    });
  }
  OIQ.ui.openSettings = openSettings;

  // ---------- command palette ----------
  function openCmdk() {
    if (document.querySelector('.cmdk-overlay')) return;
    const ov = el('<div class="cmdk-overlay"></div>');
    const box = el(`
      <div class="cmdk">
        <div class="cmdk-input">${icon('search', 18)}<input placeholder="Search traces, pages, actions…" id="cmdk-q"><span class="kbd">Esc</span></div>
        <div class="cmdk-list" id="cmdk-list"></div>
      </div>`);
    ov.appendChild(box);
    document.getElementById('cmdk-root').appendChild(ov);
    const input = box.querySelector('#cmdk-q');
    const list = box.querySelector('#cmdk-list');
    let sel = 0, items = [];
    function build(q) {
      q = (q || '').trim().toLowerCase();
      items = [];
      NAV.forEach(([id, label]) => items.push({ icon: 'dashboard', label: 'Go to ' + label, hint: 'Page', run: () => OIQ.go('#/' + id) }));
      items.push({ icon: 'moon', label: 'Toggle dark / light theme', hint: 'Action', run: () => setTheme(OIQ.state.theme === 'dark' ? 'light' : 'dark') });
      items.push({ icon: 'bolt', label: (OIQ.state.live ? 'Pause' : 'Resume') + ' live trace stream', hint: 'Action', run: () => { OIQ.state.live = !OIQ.state.live; OIQ.emit('live', OIQ.state.live); renderTopnav(); } });
      items.push({ icon: 'gear', label: 'Open settings', hint: 'Action', run: openSettings });
      items.push({ icon: 'git', label: 'Inspect handoff Router → Billing (tr_84921)', hint: 'Debug', run: () => OIQ.go('#/trace/tr_84921/handoff') });
      D.traces.forEach((t) => {
        if (q && !(t.id.includes(q) || t.workflow.toLowerCase().includes(q) || t.status.toLowerCase().includes(q))) return;
        if (!q && items.length > 14) return;
        items.push({ icon: t.status === 'Failed' ? 'warning' : 'check', label: `${t.id} · ${t.workflow}`, hint: t.status, run: () => OIQ.go('#/trace/' + t.id) });
      });
      if (q) items = items.filter((i) => i.label.toLowerCase().includes(q) || i.hint.toLowerCase().includes(q));
      sel = 0;
      render();
    }
    function render() {
      if (!items.length) { list.innerHTML = '<div class="cmdk-empty">No matches — try a trace id like tr_849</div>'; return; }
      list.innerHTML = '';
      items.forEach((it, i) => {
        const d = el(`<div class="cmdk-item ${i === sel ? 'sel' : ''}">${icon(it.icon, 16)}<span>${it.label}</span><span class="ck">${it.hint}</span></div>`);
        d.onclick = () => { close(); it.run(); };
        list.appendChild(d);
      });
    }
    function close() { ov.remove(); document.removeEventListener('keydown', onKey, true); }
    function onKey(e) {
      if (e.key === 'Escape') { close(); }
      else if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); render(); e.preventDefault(); }
      else if (e.key === 'Enter') { const it = items[sel]; close(); if (it) it.run(); }
    }
    input.addEventListener('input', () => build(input.value));
    input.addEventListener('keydown', onKey);
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
    document.addEventListener('keydown', onKey, true);
    build('');
    setTimeout(() => input.focus());
  }
  OIQ.ui.openCmdk = openCmdk;

  // global keys
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openCmdk(); }
    else if (e.key === '?' && !/input|textarea/i.test(document.activeElement.tagName)) openHelp();
  });

  // ---------- live trace stream ----------
  let streamTimer = null;
  function nextStreamTrace() {
    const n = 84933 + OIQ.state.newTraces;
    OIQ.state.newTraces++;
    const failed = Math.random() < 0.4;
    const tk = 3000 + Math.floor(Math.random() * 22000);
    const t = D.makeTrace([
      'tr_' + n,
      D.workflows[Math.floor(Math.random() * D.workflows.length)],
      new Date().toTimeString().slice(0, 8),
      (1.2 + Math.random() * 6).toFixed(2) + 's',
      5 + Math.floor(Math.random() * 7),
      tk, +(tk * 0.0000337).toFixed(2),
      failed ? 'Failed' : 'Success',
    ]);
    t.started = t.startedClock + '.' + String(100 + Math.floor(Math.random() * 899));
    t.fresh = true;
    return t;
  }
  function startStream() {
    clearInterval(streamTimer);
    if (FREEZE) return;
    streamTimer = setInterval(() => {
      if (!OIQ.state.live) return;
      const t = nextStreamTrace();
      OIQ.data.traces.unshift(t);
      OIQ.emit('live-trace', t);
    }, 6000);
  }

  // ---------- incident creation (shared with trace page) ----------
  OIQ.emitIncident = (inc) => { D.incidents.unshift(inc); D.notifs.unshift({ icon: 'warning', tone: 'red', title: inc.title, sub: `${inc.id} · ${inc.where} · just now`, go: '#/incidents' }); OIQ.emit('incidents'); };

  // ---------- router ----------
  const ROUTES = {
    overview: { title: 'Overview' }, workflows: { title: 'Workflows' }, livemap: { title: 'Live Map' },
    traces: { title: 'Traces' }, incidents: { title: 'Incidents' }, insights: { title: 'Insights' },
  };
  let currentCleanup = null;
  function parseHash() {
    const h = (location.hash || '#/overview').replace(/^#\/?/, '');
    const seg = h.split('/').filter(Boolean);
    if (seg[0] === 'trace' && seg[1]) return { page: 'trace', id: seg[1], sub: seg[2] || null };
    return { page: ROUTES[seg[0]] ? seg[0] : 'overview' };
  }
  function route() {
    const r = parseHash();
    OIQ.state.route = r;
    const rootEl = document.getElementById('page-root');
    if (typeof currentCleanup === 'function') { try { currentCleanup(); } catch (e) { __errs.push(['cleanup', String(e)]); } }
    currentCleanup = null;
    rootEl.innerHTML = '';
    const key = r.page;
    const def = OIQ.pages[key] || OIQ.pages.overview;
    rootEl.className = 'page-root';
    if (!def) {
      rootEl.appendChild(el('<div class="card card-pad" style="margin:30px">Module not loaded yet — run build.py with all pg-* modules.</div>'));
      currentCleanup = null;
      renderTopnav(); renderRail();
      return;
    }
    try {
      def.mount(rootEl, r);
      rootEl.firstElementChild && rootEl.firstElementChild.classList.add('page-enter');
    } catch (e) {
      __errs.push(['mount', key, String(e && e.stack || e)]);
      rootEl.appendChild(el(`<div class="card card-pad">Page failed to render: ${esc(String(e && e.message))}</div>`));
    }
    currentCleanup = def.unmount || null;
    renderTopnav(); renderRail();
    document.title = (def.title || 'OrchestrateIQ') + ' · OrchestrateIQ';
  }
  window.addEventListener('hashchange', route);

  // ---------- boot ----------
  // scripts run before DOMContentLoaded, so every pg-* module has registered by then
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  function boot() {
    if (Q.get('theme')) setTheme(Q.get('theme') === 'dark' ? 'dark' : 'light');
    renderTopnav(); renderRail(); startStream(); route();
  }

  window.__oiq = OIQ;
})();
