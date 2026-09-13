;/* ==== pg-handoff.js ==== */
(function () {
  // inline mini-icons (stroke currentColor, same style as icons.js)
  const CIRC_OK = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.6"/><path d="m8.6 12.3 2.3 2.3 4.6-5"/></svg>';
  const CIRC_NO = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.6"/><path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6"/></svg>';
  const ARROW_END = '<svg width="22" height="14" viewBox="0 0 22 14" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 7h16"/><path d="m13 2 5.5 5-5.5 5"/></svg>';

  const el = (h) => window.OIQ.el(h);
  const esc = (s) => window.OIQ.esc(s);
  const ico = (n, s) => window.OIQ.icon(n, s || 16);

  // OIQ.ui.toast is in the contract but not yet exposed by core.js —
  // use it when it lands, otherwise fall back to identical inline markup.
  function toast(msg, kind, action) {
    const T = window.OIQ.ui;
    if (T && typeof T.toast === 'function') return T.toast(msg, kind, action);
    const root = document.getElementById('toast-root');
    if (!root) return function () {};
    const t = el('<div class="toast ' + (kind || 'info') + '"><span>' + ico(kind === 'success' ? 'check' : kind === 'warn' ? 'warning' : 'spark', 15) + '</span><span>' + esc(msg) + '</span>' + (action ? '<button class="undo">' + esc(action.label) + '</button>' : '') + '</div>');
    const kill = function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 240); };
    if (action) t.querySelector('.undo').onclick = function () { action.onClick(); kill(); };
    root.appendChild(t);
    setTimeout(kill, action ? 5200 : 3200);
    return kill;
  }

  let rootEl = null;
  let openedModalClose = null;
  let activeCleanup = null;

  function fieldRowHtml(d, f) {
    const sent = f.sent[1]
      ? '<span class="ho-c"><i class="ic ok">' + ico('check', 14) + '</i>' + esc(f.sent[0]) + '</span>'
      : '<span class="ho-c err"><i class="ic no">' + ico('x', 13) + '</i>' + esc(f.sent[0]) + '</span>';
    const exp = f.exp[1]
      ? '<span class="ho-c"><i class="ic ok">' + ico('check', 14) + '</i>' + esc(f.exp[0]) + '</span>'
      : '<span class="ho-c na"><i class="dash">—</i>' + esc(f.exp[0]) + '</span>';
    const st = f.bad
      ? '<span class="ho-missing">Missing</span>'
      : (f.unused ? '<span class="badge badge-gray">Unused</span>' : '<span class="badge badge-green">Match</span>');
    return '<div class="ho-rowwrap' + (f.bad ? ' bad' : '') + '">' +
      '<div class="ho-tr" role="button" tabindex="0" aria-expanded="false" title="Click to inspect sample value">' +
        '<span class="ho-f' + (f.bad ? ' red' : '') + '">' + esc(f.f) + '</span>' +
        sent + exp + st +
      '</div>' +
      '<div class="ho-sample"><div><code>' + esc((d.samples || {})[f.f] || '—') + '</code></div></div>' +
    '</div>';
  }

  function mount(root, params) {
    const O = window.OIQ, D = O.data, d = D.handoff;
    const traceId = (params && params.id) || d.traceId;
    const applied = !!O.state.fixApplied;
    root.innerHTML = '';

    // ---------- header + handoff path ----------
    const stats = [
      [d.path.ctxKB + ' KB', 'context'],
      [d.path.latencyMs + ' ms', 'latency'],
      [D.fmt.num(d.path.tokens), 'tokens'],
      [d.path.fields, 'fields'],
    ].map(function (s) { return '<div class="ho-stat"><b>' + esc(s[0]) + '</b><span>' + s[1] + '</span></div>'; }).join('');

    const head = el(
      '<section class="card ho-head">' +
        '<nav class="ho-crumbs" aria-label="Breadcrumb">' +
          '<button data-nav="traces">Traces</button><span class="sep">›</span>' +
          '<button data-nav="trace">' + esc(traceId) + '</button><span class="sep">›</span>' +
          '<span class="cur">Handoff</span>' +
        '</nav>' +
        '<div class="ho-headrow">' +
          '<div class="ho-tw">' +
            '<div class="ho-titlebar"><h1>' + esc(d.title) + '</h1>' +
              '<span class="badge badge-red ho-degraded"><i class="dot dot-red"></i>' + esc(d.status) + '</span></div>' +
            '<div class="ho-sub">Handoff inspector · ' + esc(d.workflow) + ' · trace ' + esc(traceId) + ' · ' + esc(d.at) + '</div>' +
          '</div>' +
          '<div class="ho-actions">' +
            '<button class="pill-btn" data-nav="back">' + ico('back', 15) + '<span>Back to trace</span></button>' +
            '<button class="pill-btn" data-nav="root">' + ico('arrow-up-right', 15) + '<span>View root cause</span></button>' +
          '</div>' +
        '</div>' +
        '<div class="ho-pathsec">' +
          '<span class="lbl">Handoff path</span>' +
          '<div class="ho-path">' +
            '<div class="ho-node ho-from"><span class="ho-nicon">' + ico('robot', 20) + '</span>' +
              '<div><div class="ho-nname">' + esc(d.from) + '</div><div class="ho-nsub">sends context · scope: ' + esc(d.path.fromScope) + '</div></div></div>' +
            '<div class="ho-line ho-lgreen"><i class="tipdot"></i><i class="ln"></i></div>' +
            '<div class="ho-stats">' + stats + '</div>' +
            '<div class="ho-line ho-lamber"><i class="ln"></i><i class="ho-slash s1"></i><i class="ho-slash s2"></i><span class="ho-arrow">' + ARROW_END + '</span></div>' +
            '<div class="ho-node ho-to"><span class="ho-nicon">' + ico('robot', 22) + '</span>' +
              '<div><div class="ho-nname">' + esc(d.to) + '</div><div class="ho-nsub">rejected request · scope: ' + esc(d.path.toScope) + '</div></div></div>' +
          '</div>' +
        '</div>' +
      '</section>'
    );

    // ---------- context comparison ----------
    const ctx = el(
      '<section class="card ho-ctx">' +
        '<div class="ho-ctx-head"><h2>Context comparison</h2>' +
          '<span class="badge badge-red">' + CIRC_OK + esc(d.path.fields) + ' required fields present</span></div>' +
        '<div class="ho-thead">' +
          '<span class="lbl">Context field</span><span class="lbl">Sent by router</span>' +
          '<span class="lbl">Expected by billing</span><span class="lbl">Status</span>' +
        '</div>' +
        '<div class="ho-rows">' + d.fields.map(function (f) { return fieldRowHtml(d, f); }).join('') + '</div>' +
        '<div class="callout red ho-drop">' + CIRC_NO + '<span>' + esc(d.dropNote) + '</span></div>' +
        '<div class="ho-payload">' +
          '<div class="ho-prow"><span class="lbl">Context payload size</span>' +
            '<b class="ho-pval">' + esc(d.payloadKB) + ' KB · ' + esc(d.payloadX) + '</b></div>' +
          '<div class="ho-bar"><i style="--ho-fill:62%"></i></div>' +
          '<div class="ho-bloat">' + esc(d.bloat) + '</div>' +
        '</div>' +
        '<div class="ho-recent">' +
          '<span class="lbl">Recent runs on this handoff · Last 24 hours</span>' +
          d.recent.map(function (r) {
            return '<button class="ho-rrow" data-go="#/trace/' + esc(r.id) + '">' +
              '<span class="rid">' + esc(r.id) + '</span>' +
              '<span class="rst' + (r.bad ? ' bad' : '') + '"><i class="dot ' + (r.bad ? 'dot-red' : 'dot-green') + '"></i>' + esc(r.st) + '</span>' +
              '<span class="rn">' + esc(r.kb) + '</span><span class="rn">' + esc(r.ms) + '</span><span class="rn">' + esc(r.at) + '</span>' +
            '</button>';
          }).join('') +
        '</div>' +
      '</section>'
    );

    // ---------- blast radius ----------
    const kv = function (k, v) { return '<div class="kv"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>'; };
    const blast = el(
      '<section class="card ho-blast">' +
        '<span class="lbl">Blast radius · 24h</span>' +
        '<div class="ho-kvs">' +
          kv('Affected runs', d.blast.affected) +
          kv('Failure rate on edge', esc(d.blast.failureRate)) +
          kv('Wasted compute', esc(d.blast.wasted)) +
          kv('Downstream blocked', d.blast.blocked) +
        '</div>' +
        '<div class="ho-ai"><span class="ho-iq">IQ</span><b>OrchestrateIQ analysis</b></div>' +
        '<p class="ho-analysis">' + esc(d.analysis) + '</p>' +
        '<div class="ho-fixbox' + (applied ? ' applied' : '') + '">' +
          '<div class="fx-head"><span class="fx-title">' + esc(d.fix.title) + '</span>' +
            (applied ? '<span class="badge badge-green">' + ico('check', 13) + 'Fix proposed</span>' : '') + '</div>' +
          '<p>' + esc(d.fix.body) + '</p>' +
        '</div>' +
        '<div class="ho-else">' +
          '<span class="lbl">Same pattern elsewhere</span>' +
          d.elsewhere.map(function (e2) {
            return '<div class="ho-ecard"><i class="dot dot-amber"></i><div><b>' + esc(e2.edge) + '</b><span>' + esc(e2.note) + '</span></div></div>';
          }).join('') +
        '</div>' +
        '<div class="ho-fixslot">' +
          (applied
            ? '<button class="ho-viewfix" data-fix="view">' + ico('eye', 16) + '<span>View fix</span></button>'
            : '<button class="btn-primary ho-create" data-fix="create">' + ico('wrench', 16) + '<span>Create fix</span></button>') +
        '</div>' +
        '<button class="ho-dismiss" data-act="dismiss">' + ico('x', 14) + '<span>Dismiss recommendation</span></button>' +
        '<button class="ho-undobar" data-act="undo" style="display:none">Recommendation dismissed — <b>Undo</b></button>' +
      '</section>'
    );

    rootEl = el('<div class="pg pg-handoff' + (O.freeze ? ' no-anim' : '') + '"><div class="pg-scroll"></div></div>');
    const grid = el('<div class="ho-grid"></div>');
    grid.appendChild(ctx); grid.appendChild(blast);
    rootEl.firstElementChild.appendChild(head);
    rootEl.firstElementChild.appendChild(grid);
    root.appendChild(rootEl);

    // ---------- interactions ----------
    function setDismissed(dis, quiet) {
      O.state.recDismissed = dis;
      const q = function (sel) { return rootEl && rootEl.querySelector(sel); };
      const box = q('.ho-fixbox'), slot = q('.ho-fixslot'), dis2 = q('.ho-dismiss'), bar = q('.ho-undobar');
      if (box) box.style.display = dis ? 'none' : '';
      if (slot) slot.style.display = dis ? 'none' : '';
      if (dis2) dis2.style.display = dis ? 'none' : '';
      if (bar) bar.style.display = dis ? 'flex' : 'none';
      if (!quiet) {
        if (dis) toast('Recommendation dismissed', 'info', { label: 'Undo', onClick: function () { setDismissed(false, true); } });
        else toast('Recommendation restored', 'success');
      }
    }

    function refreshFixUI() {
      if (!rootEl) return;
      const isApplied = !!O.state.fixApplied;
      const box = rootEl.querySelector('.ho-fixbox');
      if (box) {
        box.classList.toggle('applied', isApplied);
        const fh = box.querySelector('.fx-head');
        if (isApplied && !fh.querySelector('.badge')) {
          fh.insertAdjacentHTML('beforeend', '<span class="badge badge-green">' + ico('check', 13) + 'Fix proposed</span>');
        }
      }
      const slot = rootEl.querySelector('.ho-fixslot');
      if (slot) slot.innerHTML = isApplied
        ? '<button class="ho-viewfix" data-fix="view">' + ico('eye', 16) + '<span>View fix</span></button>'
        : '<button class="btn-primary ho-create" data-fix="create">' + ico('wrench', 16) + '<span>Create fix</span></button>';
    }

    function openFix(viewOnly) {
      const body = el(
        '<div class="pg-handoff ho-fixmodal">' +
          '<div class="ho-diffhead"><span class="lbl">Diff preview</span><code class="ho-file">handoffs/router_billing.contract</code></div>' +
          '<div class="ho-difflist">' +
            d.fix.diff.map(function (r) {
              return '<div class="ho-diffrow ' + (r.add ? 'add' : 'del') + '"><code>' + esc(r.k) + '</code><span>' + esc(r.note) + '</span></div>';
            }).join('') +
          '</div>' +
          '<div class="callout blue">' + ico('spark', 15) + '<span>' + esc(d.fix.body) + '</span></div>' +
        '</div>'
      );
      const actions = viewOnly
        ? [{ label: 'Close', kind: 'primary' }]
        : [{ label: 'Cancel' }, { label: 'Apply fix', kind: 'primary', onClick: applyFix }];
      openedModalClose = O.ui.modal({
        title: (viewOnly ? 'Proposed fix' : 'Create fix') + ' — ' + d.title,
        body: body,
        actions: actions,
        onClose: function () { openedModalClose = null; },
      });
    }

    function applyFix() {
      O.state.fixApplied = true;
      refreshFixUI();
      const tail = d.fix.body.split('Projected: ')[1];
      toast('Fix proposed — ' + (tail || 'handoff contract updated'), 'success');
    }

    function onClick(e) {
      const nav = e.target.closest('[data-nav]');
      if (nav) {
        const mode = nav.dataset.nav;
        if (mode === 'traces') { O.go('#/traces'); return; }
        if (mode === 'trace' || mode === 'back') {
          if (mode === 'back') O.state.selectedSpan = null;
          O.go('#/trace/' + traceId);
          return;
        }
        if (mode === 'root') {
          const t = D.getTrace ? D.getTrace(traceId) : null;
          const es = t && t.spans ? t.spans.find(function (s) { return s.err; }) : null;
          O.state.selectedSpan = es ? es.spanId : null; // trace page scrolls/highlights this span
          O.go('#/trace/' + traceId);
          return;
        }
      }
      const fixBtn = e.target.closest('[data-fix]');
      if (fixBtn) { openFix(fixBtn.dataset.fix === 'view'); return; }
      const act = e.target.closest('[data-act]');
      if (act) {
        if (act.dataset.act === 'dismiss') setDismissed(true);
        else if (act.dataset.act === 'undo') setDismissed(false, true);
        return;
      }
      const tr = e.target.closest('.ho-tr');
      if (tr) {
        const w = tr.parentElement;
        const open = w.classList.toggle('open');
        tr.setAttribute('aria-expanded', open ? 'true' : 'false');
        return;
      }
      const rr = e.target.closest('[data-go]');
      if (rr) O.go(rr.dataset.go);
    }

    function onKey(e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const t = e.target;
      if (t && t.matches && t.matches('.ho-tr, .ho-rrow')) { e.preventDefault(); t.click(); }
    }

    rootEl.addEventListener('click', onClick);
    rootEl.addEventListener('keydown', onKey);
    if (O.state.recDismissed) setDismissed(true, true);

    activeCleanup = function () {
      if (openedModalClose) { try { openedModalClose(); } catch (e) { /* noop */ } openedModalClose = null; }
      if (rootEl) {
        rootEl.removeEventListener('click', onClick);
        rootEl.removeEventListener('keydown', onKey);
        rootEl = null;
      }
    };
  }

  function unmount() {
    if (activeCleanup) { try { activeCleanup(); } catch (e) { /* noop */ } activeCleanup = null; }
  }

  window.OIQ.registerPage('handoff', { title: 'Handoff Inspector', mount: mount, unmount: unmount });
})();
