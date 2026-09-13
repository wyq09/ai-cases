;/* ==== pg-trace.js ==== */
(function () {
  const OIQ = window.OIQ;
  const D = window.OIQ_DATA;
  const el = OIQ.el;
  const esc = OIQ.esc;
  const icon = (n, s) => window.__ICON_LIB.icon(n, s);
  const F = D.fmt;
  const TABS = [['waterfall', 'Waterfall'], ['timeline', 'Timeline'], ['context', 'Context'], ['metadata', 'Metadata'], ['raw', 'Raw JSON']];

  // ---------- small helpers ----------
  const fmtDur = (v) => {
    const r = Math.round(v * 100) / 100;
    return (Number.isInteger(r) ? String(r) : String(parseFloat(r.toFixed(2)))) + 's';
  };
  const fmtTok = (n) => F.num(Math.round(n));
  const barCls = (dot) => (dot === 'amber' ? 'b-amber' : dot === 'red' ? 'b-red' : 'b-blue');

  // context-flow hops derived from the span chain (supervisor -> first child -> failing/deep agent)
  function ctxHops(t) {
    const spans = t.spans || [];
    if (!spans.length) return [];
    const first = spans[0];
    let second = null;
    for (let i = 1; i < spans.length; i++) { if (spans[i].parentId === first.spanId) { second = spans[i]; break; } }
    if (!second) second = spans[1] || first;
    const fail = spans.find((s) => s.err && s.kind !== 'ghost');
    let third = (fail && fail !== first && fail !== second) ? fail : (spans.find((s) => s !== first && s !== second) || first);
    const out = [];
    [first, second, third].forEach((s) => {
      if (!s || out.some((h) => h.span === s)) return;
      out.push({ span: s, name: s.agent, short: String(s.agent).replace(/ Agent$/, ''), fields: s.ctxFields, kb: s.ctxKB, bad: !!(s.err && s.kind !== 'ghost') });
    });
    return out;
  }

  // waterfall rows: spans sorted by t0, a retry joins its run row
  function buildRows(t) {
    const spans = (t.spans || []).map((s, i) => ({ s, i }));
    const order = spans.slice().sort((a, b) => (a.s.t0 - b.s.t0) || (a.i - b.i));
    const rows = [];
    order.forEach(({ s, i }) => {
      const last = rows[rows.length - 1];
      if (s.kind === 'retry' && last && last.agent === s.agent) last.spans.push({ s, i });
      else rows.push({ agent: s.agent, dot: s.dot, spans: [{ s, i }] });
    });
    return rows;
  }

  function tickLabels(t) {
    const dur = t.dur || 1;
    const out = [];
    for (let i = 0; i < 5; i++) {
      if (i === 4) { out.push(esc(t.durText)); continue; }
      const v = (dur * i) / 4;
      const r = Math.round(v * 10) / 10;
      out.push(r >= 1 ? parseFloat(r.toFixed(1)) + 's' : Math.round(v * 1000) + 'ms');
    }
    return out;
  }

  function flowNote(st) {
    const t = st.t;
    const hops = st.hops;
    const badHop = hops.find((h) => h.bad);
    const failSpan = t.spans.find((s) => s.err && s.kind !== 'ghost');
    if (badHop && hops.length >= 3 && failSpan) {
      if (failSpan.err.type === 'AuthorizationContextMissing') {
        const m = String(failSpan.err.msg || '').match(/field ([a-zA-Z_]+) was not present/);
        const field = m ? m[1] : 'a required field';
        return `${esc(field)} present at ${esc(hops[0].short)} and ${esc(hops[1].short)}, absent at ${esc(badHop.short)} — context was lost in the ${esc(hops[1].short)} → ${esc(badHop.short)} handoff.`;
      }
      return `${esc(badHop.short)} rejected the invocation with ${esc(failSpan.err.type)} — context arriving from ${esc(hops[1].short)} was incomplete for the handoff.`;
    }
    if (badHop) return `${esc(badHop.short)} reported a degraded handoff — review the invocation detail for the underlying error.`;
    return `Context handed off cleanly across all ${hops.length} hop${hops.length === 1 ? '' : 's'} — field coverage and payload size within baseline for ${esc(t.workflow)}.`;
  }

  // ---------- state ----------
  let inner = null; // delegated module (handoff)
  const localToasts = []; // fallback toasts (when OIQ.ui.toast is unavailable)

  function notify(msg, kind) {
    if (OIQ.ui && typeof OIQ.ui.toast === 'function') { OIQ.ui.toast(msg, kind || 'info'); return; }
    const root = document.getElementById('toast-root');
    if (!root) return;
    const t = el('<div class="toast ' + (kind || 'info') + '"><span>' + icon(kind === 'success' ? 'check' : 'spark', 15) + '</span><span>' + esc(msg) + '</span></div>');
    root.appendChild(t);
    const timer = setTimeout(() => {
      const i = localToasts.findIndex((x) => x.t === t);
      if (i >= 0) localToasts.splice(i, 1);
      t.remove();
    }, 3200);
    localToasts.push({ t, timer });
  }

  function defaultSel(st) {
    const want = OIQ.state && OIQ.state.selectedSpan;
    if (want) {
      const i = st.t.spans.findIndex((s) => s.spanId === want);
      if (i >= 0) return i;
    }
    const f = st.t.spans.findIndex((s) => s.err && s.kind !== 'ghost');
    return f >= 0 ? f : 0;
  }

  function rowIdxOf(st, spanIdx) {
    return st.rows.findIndex((r) => r.spans[0].i === spanIdx);
  }

  function selectRow(st, spanIdx) {
    st.sel = spanIdx;
    const p = st.t.spans[spanIdx];
    if (OIQ.state && p) OIQ.state.selectedSpan = p.spanId;
    const ri = rowIdxOf(st, spanIdx);
    st.page.querySelectorAll('.td-row[data-span]').forEach((r) => {
      r.classList.toggle('sel', Number(r.dataset.span) === ri);
    });
    setPanel(st);
  }

  function setTab(st, tab) {
    st.tab = tab;
    st.tabButtons.forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    renderTab(st);
  }

  // ---------- header ----------
  function headerEl(st) {
    const t = st.t;
    const failed = t.status === 'Failed';
    const head = el(`
      <div class="td-head">
        <div class="td-crumb">
          <button class="td-crumb-link">Traces</button>
          <span class="td-crumb-sep">${icon('chevron-right', 13)}</span>
          <span class="td-crumb-here">${esc(t.id)}</span>
        </div>
        <div class="td-headrow">
          <div>
            <div class="td-title">
              <h1>Trace ${esc(t.id)}</h1>
              <span class="badge ${failed ? 'badge-red' : 'badge-green'}"><span class="dot ${failed ? 'dot-red' : 'dot-green'}"></span>${esc(t.status)}</span>
            </div>
            <div class="td-sub">${esc(t.workflow)} · ${esc(t.env)} · started ${esc(t.started)} · ${esc(t.framework)}</div>
          </div>
          <div class="td-actions">
            <button class="pill-btn td-handoff">${icon('arrow-up-right', 15)}Open Handoff Inspector</button>
            <button class="pill-btn td-create">${icon('git', 15)}Create incident</button>
          </div>
        </div>
        <div class="tabbar td-tabs"></div>
      </div>`);
    head.querySelector('.td-crumb-link').onclick = () => OIQ.go('#/traces');
    head.querySelector('.td-handoff').onclick = () => OIQ.go('#/trace/' + encodeURIComponent(t.id) + '/handoff');
    head.querySelector('.td-create').onclick = () => openIncidentModal(st);
    const bar = head.querySelector('.td-tabs');
    st.tabButtons = [];
    TABS.forEach(([id, label]) => {
      const b = el(`<button data-tab="${id}" class="${st.tab === id ? 'active' : ''}">${label}</button>`);
      b.onclick = () => setTab(st, id);
      bar.appendChild(b);
      st.tabButtons.push(b);
    });
    return head;
  }

  // ---------- 6 stat boxes ----------
  function statsEl(st) {
    const t = st.t;
    const failed = t.status === 'Failed';
    const boxes = [
      { k: 'Duration', v: esc(t.durText), n: 'p95 = ' + esc(t.p95) },
      { k: 'Agents invoked', v: String(t.agents), n: t.retries + (t.retries === 1 ? ' retry' : ' retries') },
      { k: 'Tokens', v: F.num(t.tokens), n: 'in ' + F.num(t.tokensIn) + ' · out ' + F.num(t.tokensOut) },
      { k: 'Cost', v: F.money(t.cost), n: t.costX + '× workflow avg', nred: t.costX >= 2 },
      failed
        ? { k: 'Failed at', v: esc(t.rootAgent || '—'), n: 'invocation ' + t.failedInvocation + ' of ' + t.agents, nred: true }
        : { k: 'Failed at', v: 'Completed', n: '—' },
      failed
        ? { k: 'Root cause', v: esc(t.rootCause || 'Error'), red: true, n: esc(t.rootNote || t.errType || ''), nred: true }
        : { k: 'Root cause', v: '—', n: '—' },
    ];
    const grid = el('<div class="td-stats"></div>');
    boxes.forEach((b) => {
      grid.appendChild(el(`<div class="kv"><div class="k">${b.k}</div><div class="v${b.red ? ' red' : ''}">${b.v}</div><div class="note${b.nred ? ' red' : ''}">${b.n}</div></div>`));
    });
    return grid;
  }

  // ---------- waterfall tab ----------
  function waterfallEl(st) {
    const t = st.t;
    const dur = t.dur || 1;
    const wrap = el('<div class="td-grid"><div class="card card-pad td-left"></div><div class="td-right"><div class="card card-pad td-inv"></div></div></div>');
    const left = wrap.querySelector('.td-left');
    left.appendChild(el('<div class="td-cardshead"><h2 class="card-title">Execution waterfall</h2><span class="td-hint">click a span to inspect it</span></div>'));

    const ticks = tickLabels(t);
    left.appendChild(el(`<div class="td-axis"><span></span><div class="td-ticks">${ticks.map((lb, i) => `<span class="td-tick t${i}">${lb}</span>`).join('')}</div><span></span></div>`));

    const rowsEl = el('<div class="td-rows"></div>');
    const selRow = rowIdxOf(st, st.sel);
    st.rows.forEach((r, ri) => {
      let retryN = 0;
      let durSum = 0;
      let tokSum = 0;
      const bars = r.spans.map(({ s }) => {
        durSum += (s.t1 - s.t0) || 0;
        tokSum += s.tok || 0;
        const lp = ((s.t0 / dur) * 100).toFixed(3);
        const wp = (((s.t1 - s.t0) / dur) * 100).toFixed(3);
        if (s.kind === 'ghost') return `<span class="td-ghost" style="left:${lp}%"></span>`;
        if (s.kind === 'retry') { retryN += 1; return `<span class="td-retrybar" style="left:${lp}%;width:${wp}%">retry ${retryN}</span>`; }
        return `<span class="td-bar ${barCls(s.dot)}" style="left:${lp}%;width:${wp}%"></span>`;
      }).join('');
      const label = r.spans.map(({ s }) => s.durLabel).find(Boolean) || fmtDur(durSum);
      const rowEl = el(`
        <div class="td-row${ri === selRow ? ' sel' : ''}" data-span="${ri}">
          <div class="td-name" style="padding-left:${Math.min(ri * 14, 98)}px"><span class="dot dot-${r.dot}"></span><span class="td-nm">${esc(r.agent)}</span></div>
          <div class="td-track">${bars}</div>
          <div class="td-meta">${label} · ${fmtTok(tokSum)} tok</div>
        </div>`);
      rowEl.onclick = () => selectRow(st, r.spans[0].i);
      rowsEl.appendChild(rowEl);
    });
    left.appendChild(rowsEl);

    if (t.status === 'Failed') {
      const ghosts = t.spans.filter((s) => s.kind === 'ghost').map((s) => String(s.agent).replace(/ Agent$/, ''));
      const names = ghosts.length
        ? (ghosts.length === 1 ? ghosts[0] : ghosts.slice(0, -1).join(', ') + ' and ' + ghosts[ghosts.length - 1])
        : 'Downstream agents';
      const verb = ghosts.length === 1 ? 'was' : 'were';
      left.appendChild(el(`<div class="callout red td-callout"><span class="td-coic">${icon('check', 12)}</span><span>${esc(names)} ${verb} never reached — the run terminated at ${esc(t.rootAgent || 'the failing agent')} retry 1.</span></div>`));
    }

    left.appendChild(el('<div class="lbl td-flowlbl">Context flow across the run</div>'));
    const flow = el('<div class="td-flow"></div>');
    st.hops.forEach((h, i) => {
      if (i) flow.appendChild(el(`<span class="td-arrow">${icon('arrow-right', 14)}</span>`));
      flow.appendChild(el(`<div class="td-flowcard${h.bad ? ' bad' : ''}">
        <span class="ic-circle ${h.bad ? 'ic-red' : 'ic-green'}">${icon('robot', 17)}</span>
        <div class="td-flowwho"><b>${esc(h.name)}</b><span>${h.fields} fields · ${h.kb} KB</span></div>
      </div>`));
    });
    left.appendChild(flow);
    left.appendChild(el('<div class="td-flownote">' + flowNote(st) + '</div>'));

    return wrap;
  }

  // ---------- invocation detail panel ----------
  function panelHTML(st) {
    const t = st.t;
    const s = t.spans[st.sel] || t.spans[0] || {};
    const group = st.rows.find((r) => r.spans.some((x) => x.i === st.sel)) || { spans: [{ s }] };
    const ghost = s.kind === 'ghost';
    const tokTotal = group.spans.reduce((a, x) => a + (x.s.tok || 0), 0);
    const retryCount = group.spans.filter((x) => x.s.kind === 'retry').length;
    const isRoot = t.spans.indexOf(s) === 0;
    const badge = ghost
      ? '<span class="badge badge-gray"><span class="dot dot-gray"></span>Scheduled</span>'
      : (s.err
        ? '<span class="badge badge-red"><span class="dot dot-red"></span>Failed</span>'
        : '<span class="badge badge-green"><span class="dot dot-green"></span>Success</span>');
    const icCls = s.dot === 'red' ? 'ic-red' : s.dot === 'amber' ? 'ic-amber' : s.dot === 'gray' ? 'ic-gray' : 'ic-green';
    let html = `
      <div class="lbl">Invocation detail</div>
      <div class="td-invhead">
        <span class="ic-circle ${icCls}">${icon('robot', 22)}</span>
        <div class="td-invwho">
          <div class="td-invtop"><b>${esc(s.agent || '—')}</b>${badge}</div>
          <span>span ${esc(s.spanId || '—')} · ${isRoot ? 'root span' : 'parent ' + esc(s.parentId || '—')}</span>
        </div>
      </div>`;
    if (ghost) {
      html += `
        <div class="td-ghostnote">${icon('clock', 16)}<div><b>Not executed</b><span>scheduled but never reached</span></div></div>
        <div class="td-invgrid">
          <div class="kv"><div class="k">Model</div><div class="v">${esc(s.model || '—')}</div></div>
          <div class="kv"><div class="k">Context in</div><div class="v">${s.ctxKB ? s.ctxKB + ' KB' : '—'}</div></div>
        </div>`;
    } else {
      const tokIn = s.inTok !== undefined ? s.inTok : Math.round(tokTotal * 0.75);
      const tokOut = s.outTok !== undefined ? s.outTok : tokTotal - tokIn;
      html += `
        <div class="td-invgrid">
          <div class="kv"><div class="k">Invoked at</div><div class="v">${esc(t.started)}</div></div>
          <div class="kv"><div class="k">Duration</div><div class="v">${esc(s.wall || fmtDur(s.t1 - s.t0))}</div></div>
          <div class="kv"><div class="k">Input tokens</div><div class="v">${fmtTok(tokIn)}</div></div>
          <div class="kv"><div class="k">Output tokens</div><div class="v">${fmtTok(tokOut)}</div></div>
          <div class="kv"><div class="k">Cost</div><div class="v">${F.money(s.cost || 0)}</div></div>
          <div class="kv"><div class="k">Model</div><div class="v">${esc(s.model || '—')}</div></div>
          <div class="kv"><div class="k">Retries</div><div class="v">${retryCount ? retryCount + ' of 2' : '0'}</div></div>
          <div class="kv"><div class="k">Context in</div><div class="v">${s.ctxKB ? s.ctxKB + ' KB' : '—'}</div></div>
        </div>`;
      if (s.err) {
        html += `<div class="lbl td-errlbl">Error</div><div class="td-errbox"><b>${esc(s.err.type)}</b><p>${esc(s.err.msg)}</p></div>`;
      }
    }
    html += `
      <div class="td-invbtns">
        <button class="btn-primary td-inspect">${icon('arrow-up-right', 16)}Inspect handoff</button>
        <button class="pill-btn gray td-rawjson">${icon('doc', 16)}View raw JSON</button>
      </div>`;
    return html;
  }

  function setPanel(st) {
    const panel = st.page.querySelector('.td-inv');
    if (!panel) return;
    panel.innerHTML = panelHTML(st);
    panel.querySelector('.td-inspect').onclick = () => OIQ.go('#/trace/' + encodeURIComponent(st.t.id) + '/handoff');
    panel.querySelector('.td-rawjson').onclick = () => setTab(st, 'raw');
  }

  // ---------- timeline tab ----------
  function timelineEl(st) {
    const t = st.t;
    const card = el(`<div class="card card-pad"><div class="td-cardshead"><h2 class="card-title">Timeline</h2><span class="td-hint">${t.spans.length} spans · ${esc(t.durText)} total</span></div><div class="td-tl"></div></div>`);
    const list = card.querySelector('.td-tl');
    t.spans.forEach((s, i) => {
      const kindBadge = s.kind === 'ghost' ? '<span class="badge badge-gray">scheduled</span>' : s.kind === 'retry' ? '<span class="badge badge-red">retry</span>' : '';
      const item = el(`<div class="td-tl-item" data-tl="${i}">
        <span class="td-tl-t">+${Number(s.t0).toFixed(2)}s</span>
        <span class="td-tl-dotcol"><span class="dot dot-${s.dot}${s.kind === 'ghost' ? ' hollow' : ''}"></span></span>
        <div class="td-tl-main">
          <div class="td-tl-l1"><b>${esc(s.agent)}</b>${kindBadge}${s.err ? '<span class="td-tl-err">' + esc(s.err.type) + '</span>' : ''}</div>
          <div class="td-tl-l2">${fmtDur(s.t1 - s.t0)} · ${fmtTok(s.tok)} tok · ${esc(s.model)}${s.kind === 'ghost' ? ' · not executed' : ''}</div>
        </div>
      </div>`);
      item.onclick = () => {
        const row = st.rows.find((r) => r.spans.some((x) => x.i === i));
        st.sel = row ? row.spans[0].i : i;
        const p = t.spans[st.sel];
        if (OIQ.state && p) OIQ.state.selectedSpan = p.spanId;
        setTab(st, 'waterfall');
      };
      list.appendChild(item);
    });
    return card;
  }

  // ---------- context tab ----------
  function contextEl(st) {
    const t = st.t;
    const hops = st.hops;
    const maxKb = Math.max.apply(null, hops.map((h) => h.kb).concat([0.1]));
    const totalKb = hops.reduce((a, h) => a + h.kb, 0);
    const totalF = hops.reduce((a, h) => a + h.fields, 0);
    const bad = hops.some((h) => h.bad);
    const card = el(`<div class="card card-pad"><div class="td-cardshead"><h2 class="card-title">Context flow</h2><span class="td-hint">${hops.length} hops · ${totalF} fields · ${totalKb.toFixed(1)} KB handed off</span></div><div class="td-ctxlist"></div><div class="callout ${bad ? 'red' : 'blue'} td-ctxcallout">${icon(bad ? 'warning' : 'check', 15)}<span>${flowNote(st)}</span></div></div>`);
    const list = card.querySelector('.td-ctxlist');
    hops.forEach((h, i) => {
      if (i) list.appendChild(el(`<div class="td-ctxarrow">${icon('arrow-right', 15)}</div>`));
      list.appendChild(el(`<div class="td-ctxhop${h.bad ? ' bad' : ''}">
        <span class="ic-circle ${h.bad ? 'ic-red' : 'ic-green'}">${icon('robot', 20)}</span>
        <div class="td-ctxwho">
          <b>${esc(h.name)}</b>
          <span>${h.fields} fields · ${h.kb} KB payload</span>
          <span class="td-kbbar"><i style="width:${((h.kb / maxKb) * 100).toFixed(1)}%"></i></span>
        </div>
        <span class="badge ${h.bad ? 'badge-red' : 'badge-green'}">${h.bad ? 'context degraded' : 'healthy'}</span>
      </div>`));
    });
    return card;
  }

  // ---------- metadata tab ----------
  function metadataEl(st) {
    const t = st.t;
    const rows = [
      ['Trace ID', t.id], ['Workflow', t.workflow], ['Environment', t.env],
      ['Framework', t.framework], ['Started', t.started], ['Duration', t.durText],
      ['p95 duration', t.p95], ['Status', t.status], ['Agents invoked', String(t.agents)],
      ['Retries', String(t.retries)], ['Tokens total', F.num(t.tokens)], ['Tokens in', F.num(t.tokensIn)],
      ['Tokens out', F.num(t.tokensOut)], ['Cost', F.money(t.cost)], ['Cost vs workflow avg', t.costX + '×'],
      ['Root span', t.spans[0] ? t.spans[0].spanId : '—'], ['Failed at', t.rootAgent || '—'],
      ['Root cause', t.rootCause || '—'], ['Error type', t.errType || '—'],
    ];
    const card = el(`<div class="card card-pad"><div class="td-cardshead"><h2 class="card-title">Metadata</h2><span class="td-hint">${rows.length} fields</span></div><div class="td-mdgrid"></div></div>`);
    const grid = card.querySelector('.td-mdgrid');
    rows.forEach(([k, v]) => {
      const isStatus = k === 'Status';
      grid.appendChild(el(`<div class="kv"><div class="k">${k}</div><div class="v${v === 'Failed' && isStatus ? ' red' : ''}">${esc(String(v))}</div></div>`));
    });
    return card;
  }

  // ---------- raw json tab ----------
  function highlight(s) {
    return s.replace(/("(?:[^"\\]|\\.)*")(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, (m, str, colon) => {
      if (str) return '<span class="' + (colon ? 'j-key' : 'j-str') + '">' + str + '</span>' + (colon || '');
      if (m === 'true' || m === 'false' || m === 'null') return '<span class="j-bool">' + m + '</span>';
      return '<span class="j-num">' + m + '</span>';
    });
  }

  function rawEl(st) {
    const t = st.t;
    const payload = {
      id: t.id, workflow: t.workflow, environment: t.env, framework: t.framework,
      started: t.started, status: t.status, duration: t.durText, duration_sec: t.dur, p95: t.p95,
      agents_invoked: t.agents, retries: t.retries,
      tokens: { total: t.tokens, input: t.tokensIn, output: t.tokensOut },
      cost: { usd: t.cost, vs_workflow_avg: t.costX + 'x' },
      root_agent: t.rootAgent, root_cause: t.rootCause,
      error: t.errType ? { type: t.errType, message: t.errMsg } : null,
      spans: t.spans.map((s) => ({
        spanId: s.spanId, parentId: s.parentId || null, agent: s.agent, kind: s.kind,
        t0: s.t0, t1: s.t1, tokens: s.tok, model: s.model, cost: s.cost,
        context: { kb: s.ctxKB, fields: s.ctxFields },
        error: s.err ? { type: s.err.type, message: s.err.msg } : null,
      })),
      context_flow: st.hops.map((h) => ({ hop: h.name, fields: h.fields, kb: h.kb, degraded: h.bad })),
    };
    const json = JSON.stringify(payload, null, 2).replace(/</g, '\\u003c');
    const safe = json.replace(/&/g, '&amp;').replace(/>/g, '&gt;');
    const card = el(`<div class="card card-pad"><div class="td-cardshead"><h2 class="card-title">Raw JSON</h2><span class="td-hint">${t.spans.length} spans · payload view</span></div><pre class="td-json">${highlight(safe)}</pre></div>`);
    return card;
  }

  // ---------- tab switching ----------
  function renderTab(st) {
    const map = { waterfall: waterfallEl, timeline: timelineEl, context: contextEl, metadata: metadataEl, raw: rawEl };
    st.body.innerHTML = '';
    st.body.appendChild((map[st.tab] || waterfallEl)(st));
    if (st.tab === 'waterfall') setPanel(st);
  }

  // ---------- create incident modal ----------
  function openIncidentModal(st) {
    const t = st.t;
    const defTitle = t.errType || ('Manual flag — ' + t.workflow);
    const defDesc = t.errMsg || ('Flagged from trace ' + t.id + ' (' + t.workflow + ', ' + t.durText + ').');
    const sevs = ['critical', 'high', 'medium', 'low'];
    let sev = 'critical';
    const inpStyle = 'width:100%;border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:14px;background:var(--card);color:var(--ink);outline:none';
    const form = el(`
      <div style="display:flex;flex-direction:column;gap:14px">
        <div>
          <div class="lbl" style="display:block;margin-bottom:6px">Title</div>
          <input class="td-inc-title" style="${inpStyle}" value="${esc(defTitle)}">
        </div>
        <div>
          <div class="lbl" style="display:block;margin-bottom:6px">Severity</div>
          <button class="toolbar-pill td-inc-sev"><span>${sev}</span>${icon('chevron-down', 14)}</button>
        </div>
        <div>
          <div class="lbl" style="display:block;margin-bottom:6px">Description</div>
          <textarea class="td-inc-desc" rows="4" style="${inpStyle};resize:vertical">${esc(defDesc)}</textarea>
        </div>
        <div class="callout blue">${icon('spark', 15)}<span>Creating files this against ${esc(t.workflow)} and links run ${esc(t.id)}.</span></div>
      </div>`);
    const sevBtn = form.querySelector('.td-inc-sev');
    sevBtn.onclick = () => OIQ.ui.dropdown(sevBtn, sevs.map((sv) => ({ label: sv, value: sv, checked: sv === sev })), (it) => {
      sev = it.value;
      sevBtn.querySelector('span').textContent = sev;
    });
    OIQ.ui.modal({
      title: 'Create incident',
      body: form,
      actions: [
        { label: 'Cancel' },
        { label: 'Create incident', kind: 'primary', onClick: () => { createIncident(st, form, sev); } },
      ],
    });
  }

  function createIncident(st, form, sev) {
    const t = st.t;
    const title = form.querySelector('.td-inc-title').value.trim() || ('Incident from ' + t.id);
    const desc = form.querySelector('.td-inc-desc').value.trim();
    let n = 0;
    while (D.incidents.some((x) => x.id === 'INC-' + (2482 + n))) n += 1;
    const id = 'INC-' + (2482 + n);
    const now = new Date().toTimeString().slice(0, 8);
    OIQ.emitIncident({
      id, title, sev, dot: sev === 'medium' ? 'amber' : sev === 'low' ? 'gray' : 'red',
      where: t.workflow + ' · 1 run affected', age: 'just now', desc,
      timeline: [[now, 'Incident created from ' + t.id]], trace: t.id,
    });
    notify(id + ' created — ' + sev + ' severity, linked to ' + t.id, 'success');
  }

  // ---------- mount / unmount ----------
  function renderMain(root, params) {
    const t = D.getTrace(params.id);
    const st = { t, rows: buildRows(t), hops: ctxHops(t), tab: 'waterfall' };
    st.sel = defaultSel(st);
    const page = el('<div class="pg-trace pg"></div>');
    st.page = page;
    const scroll = el('<div class="pg-scroll"></div>');
    page.appendChild(scroll);
    scroll.appendChild(headerEl(st));
    scroll.appendChild(statsEl(st));
    const body = el('<div class="td-body"></div>');
    st.body = body;
    scroll.appendChild(body);
    root.appendChild(page);
    renderTab(st);
  }

  const api = {
    title: 'Trace',
    mount(root, params) {
      params = params || {};
      if (params.sub === 'handoff') {
        const h = OIQ.pages.handoff;
        if (h && h !== api && h.mount) {
          inner = h;
          h.mount(root, params);
        } else {
          inner = null;
          root.appendChild(el(`<div class="pg-trace pg"><div class="pg-scroll"><div class="card card-pad" style="margin-top:8px"><div class="card-title">Handoff Inspector</div><p class="sub" style="margin-top:6px">The handoff module is not loaded yet — it will render here once registered.</p><button class="pill-btn td-back" style="margin-top:14px">Back to trace</button></div></div></div>`));
          const back = root.querySelector('.td-back');
          if (back) back.onclick = () => OIQ.go('#/trace/' + encodeURIComponent(params.id));
        }
        return;
      }
      renderMain(root, params);
    },
    unmount() {
      if (inner) {
        const h = inner;
        inner = null;
        try { h.unmount && h.unmount(); } catch (e) { /* handoff cleanup is best-effort */ }
      }
      localToasts.splice(0).forEach((x) => { clearTimeout(x.timer); x.t.remove(); });
    },
  };
  OIQ.registerPage('trace', api);
})();
