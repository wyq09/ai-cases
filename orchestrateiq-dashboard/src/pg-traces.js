;/* ==== pg-traces.js ==== */
(function () {
  const el = (h) => OIQ.el(h);
  const esc = OIQ.esc;
  const icon = (n, s) => OIQ.icon(n, s);
  const fmt = OIQ.data.fmt;
  // OIQ.ui.toast is declared in contract §2 but not yet assigned in core.js — guard
  // so the page works standalone and lights up automatically once mainline adds it.
  const toast = (msg, kind) => { if (OIQ.ui.toast) OIQ.ui.toast(msg, kind); };

  // ---- filter model -----------------------------------------------------
  // chip = { type, value, text } ; MATCH[type](trace, value) -> passes filter
  const CHIP = {
    env: () => ({ type: 'env', value: 'Production', text: 'Environment: Production' }),
    wf: (v) => ({ type: 'wf', value: v || 'Customer Support', text: 'Workflow: ' + (v || 'Customer Support') }),
    status: (v) => ({ type: 'status', value: v || 'Failed', text: 'Status: ' + (v || 'Failed') }),
    dur: () => ({ type: 'dur', value: '2', text: 'Duration > 2s' }),
    agent: (v) => ({ type: 'agent', value: v || 'Billing', text: 'Agent: ' + (v || 'Billing') }),
  };
  const MATCH = {
    env: (t, v) => (t.env || 'Production') === v,
    wf: (t, v) => t.workflow === v,
    status: (t, v) => t.status === v,
    dur: (t, v) => t.dur > parseFloat(v),
    agent: (t, v) => (t.spans || []).some((s) => s.agent.toLowerCase().indexOf(String(v).toLowerCase()) >= 0),
  };
  const CATS = [
    ['env', 'Environment', 'shield'],
    ['wf', 'Workflow', 'layers'],
    ['status', 'Status', 'activity'],
    ['dur', 'Duration', 'clock'],
    ['agent', 'Agent', 'robot'],
  ];
  const VIEWS = [
    { label: 'All traces', icon: 'dashboard', make: () => [] },
    { label: 'Failures only', icon: 'warning', make: () => [CHIP.status()] },
    { label: 'Billing issues', icon: 'dollar', make: () => [CHIP.wf('Billing Reconciliation'), CHIP.agent()] },
  ];

  let cleanup = null; // per-mount teardown, invoked by unmount()

  OIQ.registerPage('traces', {
    title: 'Traces',
    mount(root) {
      // The 5 preset chips start in "display mode" (legacy chips rendered exactly
      // like the recording: all 12 truth rows visible, "42 traces match"). The
      // first user mutation — chip add/remove, search input, saved view — flips
      // `interactive` on and the same chips become real filter conditions.
      const st = {
        rows: OIQ.data.traces.slice(),
        chips: [CHIP.env(), CHIP.wf(), CHIP.status(), CHIP.dur(), CHIP.agent()],
        query: OIQ.state.traceQuery || '',
        interactive: !!OIQ.state.traceQuery,
        pageSize: 12,
      };

      root.innerHTML = '';
      const page = el(`
        <div class="pg pg-traces">
          <div class="card tr-headcard">
            <div class="tr-head">
              <div>
                <h1>Traces</h1>
                <div class="sub">Explore the complete execution path of every workflow run</div>
              </div>
              <div class="tr-actions">
                <button class="pill-btn" data-act="saved" title="Saved views">${icon('bookmark', 16)}Saved views</button>
                <button class="btn-primary" data-act="export" title="Download current view as CSV">${icon('download', 16)}Export</button>
              </div>
            </div>
            <div class="searchbar">
              ${icon('search', 17)}
              <input data-ref="q" placeholder="Search by trace ID, workflow, agent, or error message..." spellcheck="false" autocomplete="off">
              <span class="kbd">⌘K</span>
            </div>
            <div class="tr-filterrow">
              <div class="tr-chips" data-ref="chips"></div>
              <div class="tr-count" data-ref="count"></div>
            </div>
          </div>
          <div class="card tr-tablecard">
            <table class="table-g" data-ref="table">
              <thead><tr>
                <th>Trace ID</th><th>Workflow</th><th>Started</th><th>Duration</th>
                <th>Agents</th><th>Tokens</th><th>Cost</th><th>Status</th><th></th>
              </tr></thead>
              <tbody data-ref="tbody"></tbody>
            </table>
            <div class="tr-empty" data-ref="empty" hidden>
              <div class="ic">${icon('search', 20)}</div>
              <b>No traces match your filters</b>
              <div class="sub">Try removing a filter or clearing the search to see more results.</div>
              <button class="pill-btn" data-act="clear">${icon('x', 14)}Clear all filters</button>
            </div>
            <div class="tr-foot">
              <div class="tr-footnote" data-ref="foot"></div>
              <button class="toolbar-pill" data-ref="rpp">Rows per page:&nbsp;<b data-ref="rppn">12</b>${icon('chevron-down', 15)}</button>
            </div>
          </div>
        </div>`);
      root.appendChild(page);

      const $ = (name) => page.querySelector(`[data-ref="${name}"]`);
      const refs = {
        chips: $('chips'), count: $('count'), tbody: $('tbody'), table: $('table'),
        empty: $('empty'), foot: $('foot'), rpp: $('rpp'), rppn: $('rppn'), input: $('q'),
      };

      function filtered() {
        if (!st.interactive) return st.rows;
        let out = st.rows;
        const q = st.query.trim().toLowerCase();
        if (q) {
          out = out.filter((t) =>
            t.id.toLowerCase().indexOf(q) >= 0 ||
            t.workflow.toLowerCase().indexOf(q) >= 0 ||
            t.status.toLowerCase().indexOf(q) >= 0 ||
            (t.spans || []).some((s) => s.agent.toLowerCase().indexOf(q) >= 0) ||
            String(t.errMsg || '').toLowerCase().indexOf(q) >= 0);
        }
        st.chips.forEach((c) => { out = out.filter((t) => MATCH[c.type](t, c.value)); });
        return out;
      }

      function rowHtml(t, i, cls) {
        const ok = t.status === 'Success';
        const dot = ok ? 'dot-green' : 'dot-red';
        return `<tr data-id="${esc(t.id)}" class="${cls || ''}" style="--d:${i * 28}ms">
          <td><span class="tr-idcell"><span class="dot ${dot}"></span><span class="mono">${esc(t.id)}</span></span></td>
          <td><span class="wf-pill">${esc(t.workflow)}</span></td>
          <td class="td-dim">${esc(t.startedClock)}</td>
          <td class="td-strong">${esc(t.durText)}</td>
          <td>${t.agents}</td>
          <td>${fmt.num(t.tokens)}</td>
          <td class="td-strong">${fmt.money(t.cost)}</td>
          <td><span class="badge ${ok ? 'badge-green' : 'badge-red'}"><span class="dot ${dot}"></span>${ok ? 'Success' : 'Failed'}</span></td>
          <td class="td-chev">${icon('chevron-right', 16)}</td>
        </tr>`;
      }

      function update(opts = {}) {
        const list = filtered();
        const stagger = opts.anim === 'stagger';
        const slice = list.slice(0, st.pageSize);
        refs.tbody.className = stagger ? '' : 'no-anim';
        refs.tbody.innerHTML = slice.map((t, i) => rowHtml(t, i, opts.fresh && i === 0 ? 'fresh' : '')).join('');
        refs.count.textContent = `${list.length} ${list.length === 1 ? 'trace matches' : 'traces match'}`;
        refs.foot.textContent = `Showing ${slice.length} of ${list.length} matching traces · streaming live`;
        refs.empty.hidden = list.length > 0;
        refs.table.hidden = list.length === 0;
      }

      function renderChips() {
        const box = refs.chips;
        box.innerHTML = '';
        st.chips.forEach((c, i) => {
          box.appendChild(el(`<span class="chip">${esc(c.text)}<button class="chip-x" data-i="${i}" title="Remove filter">${icon('x', 11)}</button></span>`));
        });
        const has = (type) => st.chips.some((c) => c.type === type);
        const add = el(`<button class="add-filter">${icon('plus', 14)}Add filter</button>`);
        add.onclick = () => OIQ.ui.dropdown(add, [
          { head: 'Filter by' },
          ...CATS.map(([type, label, ic]) => ({ label, icon: ic, value: type, checked: has(type) })),
        ], (it) => {
          if (has(it.value)) { toast('That filter is already active', 'info'); return; }
          st.chips.push(CHIP[it.value]());
          st.interactive = true;
          renderChips();
          update();
        });
        box.appendChild(add);
      }

      // ---- header actions ----
      page.querySelector('[data-act="saved"]').onclick = (e) => {
        OIQ.ui.dropdown(e.currentTarget, [
          { head: 'Saved views' },
          ...VIEWS.map((v) => ({ label: v.label, icon: v.icon, value: v.label })),
        ], (it) => {
          const v = VIEWS.find((x) => x.label === it.value);
          if (!v) return;
          st.chips = v.make();
          st.interactive = true;
          renderChips();
          update();
          toast(`Saved view “${v.label}” applied`, 'success');
        });
      };

      page.querySelector('[data-act="export"]').onclick = () => {
        const list = filtered();
        const head = 'Trace ID,Workflow,Started,Duration,Agents,Tokens,Cost USD,Status';
        const lines = list.map((t) => [
          t.id, `"${t.workflow}"`, t.startedClock, t.durText, t.agents, t.tokens, t.cost.toFixed(2), t.status,
        ].join(','));
        const blob = new Blob([head + '\n' + lines.join('\n') + '\n'], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'traces_export.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        toast(`Exported ${list.length} traces to traces_export.csv`, 'success');
      };

      page.querySelector('[data-act="clear"]').onclick = () => {
        st.chips = [];
        st.query = '';
        OIQ.state.traceQuery = '';
        refs.input.value = '';
        st.interactive = true;
        renderChips();
        update();
        toast('All filters cleared', 'success');
      };

      // ---- search (two-way with OIQ.state.traceQuery) ----
      refs.input.value = st.query;
      refs.input.addEventListener('input', () => {
        st.query = refs.input.value;
        OIQ.state.traceQuery = refs.input.value;
        st.interactive = true;
        update();
      });
      refs.input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && refs.input.value) {
          st.query = '';
          OIQ.state.traceQuery = '';
          refs.input.value = '';
          update();
          refs.input.blur();
        }
      });
      // ⌘K / Ctrl-K focuses the trace search (contract §8); capture phase so the
      // global command-palette handler in core.js is skipped while on this page.
      const onKeyCap = (e) => {
        if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === 'k') {
          if (document.querySelector('.cmdk-overlay')) return;
          e.preventDefault();
          e.stopPropagation();
          refs.input.focus();
          refs.input.select();
        }
      };
      document.addEventListener('keydown', onKeyCap, true);

      // ---- chips: remove / add ----
      refs.chips.addEventListener('click', (e) => {
        const x = e.target.closest('.chip-x');
        if (!x) return;
        st.chips.splice(+x.dataset.i, 1);
        st.interactive = true;
        renderChips();
        update();
      });

      // ---- row click -> trace detail ----
      refs.table.addEventListener('click', (e) => {
        const tr = e.target.closest('tbody tr');
        if (tr && tr.dataset.id) OIQ.go('#/trace/' + tr.dataset.id);
      });

      // ---- rows per page ----
      refs.rpp.onclick = () => OIQ.ui.dropdown(refs.rpp, [
        { head: 'Rows per page' },
        ...[12, 24, 48].map((n) => ({ label: String(n), value: n, checked: st.pageSize === n })),
      ], (it) => {
        st.pageSize = it.value;
        refs.rppn.textContent = it.value;
        update();
      });

      // ---- live stream: new trace slides in at the top ----
      const offLive = OIQ.on('live-trace', (t) => {
        st.rows.unshift(t);
        const list = filtered();
        update({ fresh: list.length > 0 && list[0].id === t.id });
      });

      // ---- first paint ----
      renderChips();
      update({ anim: 'stagger' });

      cleanup = () => {
        offLive();
        document.removeEventListener('keydown', onKeyCap, true);
      };
    },

    unmount() {
      if (cleanup) { cleanup(); cleanup = null; }
    },
  });
})();
