;/* ==== pg-extra.js — Workflows / Live Map / Incidents / Insights (video-unseen pages) ==== */
(function () {
  const D = window.OIQ_DATA;
  const icon = (n, s) => window.__ICON_LIB.icon(n, s);
  const el = (h) => OIQ.el(h);
  const esc = (s) => OIQ.esc(s);
  const fmt = D.fmt;

  /* ============ per-mount cleanup registry (one page mounted at a time) ============ */
  const clean = { timeouts: new Set(), intervals: new Set(), raf: 0, robs: new Set(), unbinds: new Set() };
  function clearAll() {
    clean.timeouts.forEach(clearTimeout); clean.timeouts.clear();
    clean.intervals.forEach(clearInterval); clean.intervals.clear();
    if (clean.raf) cancelAnimationFrame(clean.raf);
    clean.raf = 0;
    clean.robs.forEach((ro) => ro.disconnect()); clean.robs.clear();
    clean.unbinds.forEach((f) => { try { f(); } catch (e) {} }); clean.unbinds.clear();
    hideTip();
  }
  const later = (fn, ms) => { const t = setTimeout(() => { clean.timeouts.delete(t); fn(); }, ms); clean.timeouts.add(t); return t; };

  /* ============ page-scoped tooltip (shared .tip styling) ============ */
  let tipEl = null;
  function showTip(html, e) {
    if (!tipEl || !tipEl.isConnected) { tipEl = el('<div class="tip"></div>'); document.body.appendChild(tipEl); }
    tipEl.innerHTML = html;
    moveTip(e);
  }
  function moveTip(e) {
    if (!tipEl) return;
    tipEl.style.left = Math.min(e.clientX + 14, innerWidth - tipEl.offsetWidth - 12) + 'px';
    tipEl.style.top = Math.max(8, e.clientY - tipEl.offsetHeight - 14) + 'px';
  }
  function hideTip() { if (tipEl) { tipEl.remove(); tipEl = null; } }

  function toast(msg, kind) {
    if (OIQ.ui && typeof OIQ.ui.toast === 'function') return OIQ.ui.toast(msg, kind);
    const root = document.getElementById('toast-root');
    if (!root) return;
    const t = el('<div class="toast ' + (kind || 'info') + '"><span>' + icon('spark', 15) + '</span><span>' + esc(msg) + '</span></div>');
    root.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 240); }, 3200);
  }

  /* ============ deterministic rng helpers ============ */
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rngFrom(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function smoothPath(pts) {
    if (pts.length < 2) return '';
    let d = 'M ' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ' C ' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) + ', ' + c2x.toFixed(1) + ' ' + c2y.toFixed(1) + ', ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
    }
    return d;
  }
  function abbrevTok(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/0$/, '').replace(/\.$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(Math.round(n));
  }
  function abbrevMoney(n) { return '$' + (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : Math.round(n)); }

  /* ============ shared scaffold: head card + pg-scroll ============ */
  function pageShell(cls, title, subHtml, actionsHtml) {
    return el('<div class="pg pgx ' + cls + '">'
      + '<div class="card pgx-head"><div class="pg-head">'
      + '<div><h1>' + title + '</h1><div class="sub">' + subHtml + '</div></div>'
      + '<div class="pgx-actions">' + (actionsHtml || '') + '</div>'
      + '</div></div>'
      + '<div class="pg-scroll"></div>'
      + '</div>');
  }
  function goTracesFiltered(q) {
    OIQ.state.traceQuery = q;
    toast('Filtering traces by ' + q, 'info');
    OIQ.go('#/traces');
  }

  /* ============ data aggregation (all numbers derived from OIQ_DATA) ============ */
  function aggWorkflows() {
    const map = {};
    D.workflows.forEach((w) => { map[w] = { name: w, runs: 0, ok: 0, fail: 0, cost: 0, tokens: 0 }; });
    D.traces.forEach((t) => {
      const m = map[t.workflow]; if (!m) return;
      m.runs++; m.cost += t.cost; m.tokens += t.tokens;
      if (t.status === 'Success') m.ok++; else m.fail++;
    });
    return D.workflows.map((w) => map[w]).sort((a, b) => b.runs - a.runs);
  }
  function aggRunsByWorkflow() { return aggWorkflows().map((m) => ({ name: m.name, count: m.runs })); }
  function aggTokensByModel() {
    const fam = { 'GPT-5': 'GPT-5', 'GPT-5 mini': 'GPT-5', 'Claude Sonnet 4.6': 'Claude', 'Gemini 2.5 Pro': 'Gemini' };
    const out = { 'GPT-5': 0, 'Claude': 0, 'Gemini': 0 };
    let total = 0;
    D.traces.forEach((t) => { total += t.tokens; });
    D.traces.forEach((t) => (t.spans || []).forEach((s) => { const k = fam[s.model]; if (k) out[k] += s.tok; }));
    const spanned = out['GPT-5'] + out['Claude'] + out['Gemini'] || 1;
    // normalise the three shares onto the trace-level token total
    const keys = ['GPT-5', 'Claude', 'Gemini'];
    keys.forEach((k) => { out[k] = Math.round(out[k] / spanned * total); });
    return { shares: out, total };
  }
  const FAIL_CATS = [['Context loss', 'red'], ['Timeout', 'amber'], ['Validation', 'purple'], ['Tool failure', 'blue']];
  function aggFailures() {
    const counts = {}; FAIL_CATS.forEach(([c]) => { counts[c] = 0; });
    let failed = 0;
    D.traces.forEach((t) => {
      if (t.status !== 'Failed') return;
      failed++;
      const c = t.rootCause && counts[t.rootCause] !== undefined ? t.rootCause : 'Tool failure';
      counts[c]++;
    });
    return { counts, failed };
  }
  function agentCallStats() {
    const st = {};
    D.traces.forEach((t) => (t.spans || []).forEach((s) => {
      st[s.agent] = st[s.agent] || { calls: 0, ok: 0 };
      st[s.agent].calls++;
      if (!s.err) st[s.agent].ok++;
    }));
    return st;
  }

  /* ======================================================================
     PAGE 1 · WORKFLOWS
  ====================================================================== */
  let uid = 0;
  OIQ.registerPage('workflows', {
    title: 'Workflows',
    mount(root) {
      const rows = aggWorkflows();
      const page = pageShell('pgx-workflows', 'Workflows',
        esc(D.workflows.length + ' workflows · production · live health'),
        '<button class="btn-primary" data-act="new">' + icon('plus', 16) + 'New workflow</button>');
      root.appendChild(page);
      const scroll = page.querySelector('.pg-scroll');

      const grid = el('<div class="pgx-wf-grid"></div>');
      scroll.appendChild(grid);

      rows.forEach((m, i) => {
        const degraded = m.fail > 0;
        const succ = m.runs ? Math.round(m.ok / m.runs * 1000) / 10 : null;
        const card = el('<button class="pgx-wf-card" data-wf="' + esc(m.name) + '" style="--d:' + (i * 40) + 'ms" title="View traces for ' + esc(m.name) + '">'
          + '<div class="pgx-wf-top">'
          + '<span class="ic-circle ic-blue">' + icon('layers', 17) + '</span>'
          + '<span class="pgx-wf-name"><b>' + esc(m.name) + '</b><i>' + esc(m.runs + ' runs · LangGraph') + '</i></span>'
          + '<span class="badge ' + (degraded ? 'badge-amber' : 'badge-green') + '"><span class="dot ' + (degraded ? 'dot-amber' : 'dot-green') + '"></span>' + (degraded ? 'Degraded' : 'Healthy') + '</span>'
          + '</div>'
          + '<div class="pgx-wf-stats">'
          + '<div class="pgx-wf-stat"><b>' + fmt.num(m.runs) + '</b><span>runs</span></div>'
          + '<div class="pgx-wf-stat"><b>' + (succ === null ? '—' : succ + '%') + '</b><span>success</span></div>'
          + '<div class="pgx-wf-stat"><b>' + fmt.money(+m.cost.toFixed(2)) + '</b><span>spend</span></div>'
          + '</div>'
          + '<div class="pgx-wf-spark">' + wfSpark(m.name, succ, degraded) + '</div>'
          + '</button>');
        card.addEventListener('click', () => goTracesFiltered(m.name));
        grid.appendChild(card);
      });

      page.querySelector('[data-act="new"]').addEventListener('click', () => {
        let tpl = D.workflows[0];
        const body = el('<div class="pgx pgx-form">'
          + '<div class="lbl">Name</div>'
          + '<input class="pgx-input" data-ref="name" placeholder="e.g. Refund Triage" maxlength="48" spellcheck="false">'
          + '<div class="lbl">Workflow template</div>'
          + '<button class="toolbar-pill pgx-tpl" data-ref="tpl"><span class="pgx-tpl-label">' + esc(tpl) + '</span>' + icon('chevron-down', 15) + '</button>'
          + '<div class="pgx-form-note">Creates a LangGraph scaffold from the template — demo only, nothing is persisted.</div>'
          + '</div>');
        const tplBtn = body.querySelector('[data-ref="tpl"]');
        tplBtn.addEventListener('click', () => {
          OIQ.ui.dropdown(tplBtn, D.workflows.map((w) => ({ label: w, value: w, checked: w === tpl })), (it) => {
            tpl = it.value;
            body.querySelector('.pgx-tpl-label').textContent = it.value;
          });
          // the shared dd-menu defaults under .modal-overlay (z 90 vs 100) — lift menus opened from this modal
          const menu = document.body.querySelector('.dd-menu');
          if (menu) menu.style.zIndex = '120';
        });
        OIQ.ui.modal({
          title: 'New workflow',
          body,
          actions: [{
            label: 'Create workflow', kind: 'primary',
            onClick: (m) => {
              const v = m.querySelector('[data-ref="name"]').value.trim();
              if (!v) { toast('Give the workflow a name first', 'warn'); return false; }
              toast('Workflow created (demo)', 'success');
            },
          }, { label: 'Cancel' }],
        });
        later(() => { const inp = document.querySelector('.pgx-input'); if (inp) inp.focus(); }, 60);
      });
    },
    unmount() { clearAll(); },
  });

  function wfSpark(name, succ, degraded) {
    const W = 232, Hh = 44, px = 4, py = 6;
    const r = rngFrom(hashStr('wfspark:' + name));
    const ptsV = [];
    let v = 50;
    const drift = (succ === null ? 0 : (succ >= 55 ? 1.5 : -1.6));
    for (let i = 0; i < 18; i++) { v += (r() - 0.5) * 16 + drift; v = Math.max(8, Math.min(92, v)); ptsV.push(v); }
    const lo = Math.min.apply(null, ptsV), hi = Math.max.apply(null, ptsV), span = (hi - lo) || 1;
    const pts = ptsV.map((val, i) => [px + i * (W - 2 * px) / (ptsV.length - 1), py + (1 - (val - lo) / span) * (Hh - 2 * py)]);
    const gid = 'xsg' + (++uid);
    const tone = degraded ? 'amber' : 'green';
    const dLine = smoothPath(pts);
    return '<svg class="tone-' + tone + '" viewBox="0 0 ' + W + ' ' + Hh + '" preserveAspectRatio="none" aria-hidden="true">'
      + '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">'
      + '<stop class="sa" offset="0" stop-opacity="0.2"></stop><stop class="sb" offset="1" stop-opacity="0"></stop>'
      + '</linearGradient></defs>'
      + '<path class="pgx-spark-area" d="' + dLine + ' L ' + (W - px) + ' ' + (Hh - 1) + ' L ' + px + ' ' + (Hh - 1) + ' Z" fill="url(#' + gid + ')"></path>'
      + '<path class="pgx-spark-line" d="' + dLine + '" vector-effect="non-scaling-stroke"></path>'
      + '<circle class="pgx-spark-end" cx="' + pts[pts.length - 1][0].toFixed(1) + '" cy="' + pts[pts.length - 1][1].toFixed(1) + '" r="2.6"></circle>'
      + '</svg>';
  }

  /* ======================================================================
     PAGE 2 · LIVE MAP
  ====================================================================== */
  const LM_EXTRA = [
    { id: 'knowledge', label: 'Knowledge Agent', x: 45, y: 22, health: 'green', icon: 'database' },
    { id: 'support', label: 'Support Agent', x: 45, y: 82, health: 'green', icon: 'person' },
    { id: 'payments', label: 'Payments Agent', x: 73, y: 74, health: 'amber', icon: 'dollar' },
    { id: 'billing', label: 'Billing Agent', x: 72, y: 44, health: 'red', icon: 'shield' },
    { id: 'escalation', label: 'Escalation Agent', x: 19, y: 88, health: 'gray', icon: 'bell' },
  ];
  const LM_EDGES = [
    ['user', 'supervisor', 'gray'], ['supervisor', 'research', 'gray'], ['supervisor', 'data', 'blue'],
    ['supervisor', 'knowledge', 'gray'], ['supervisor', 'support', 'gray'], ['supervisor', 'payments', 'amber'],
    ['supervisor', 'validation', 'amber'], ['supervisor', 'escalation', 'gray'],
    ['research', 'final', 'gray'], ['data', 'final', 'gray'], ['knowledge', 'final', 'gray'],
    ['support', 'billing', 'red'], ['billing', 'final', 'red'],
    ['payments', 'final', 'gray'], ['validation', 'final', 'amber'], ['escalation', 'final', 'gray'],
  ];
  const IC_TONE = { green: 'ic-green', amber: 'ic-amber', red: 'ic-red', gray: 'ic-gray' };

  OIQ.registerPage('livemap', {
    title: 'Live Map',
    mount(root) {
      const stats = agentCallStats();
      const payNote = (D.handoff.elsewhere || []).find((e) => /payments/i.test(e.edge));
      const nodes = D.network.nodes.concat(LM_EXTRA.map((n) => Object.assign({}, n, {
        sub: n.id === 'payments'
          ? (payNote ? payNote.note : 'edge service')
          : (function () {
              const s = stats[n.label];
              if (!s || !s.calls) return 'idle';
              return fmt.num(s.calls) + ' calls · ' + Math.round(s.ok / s.calls * 100) + '%';
            })(),
      })));
      const byId = {}; nodes.forEach((n) => { byId[n.id] = n; });

      const page = pageShell('pgx-livemap', 'Live Map', esc(D.network.meta),
        '<button class="toolbar-pill" data-a="zout">Zoom out</button>'
        + '<button class="toolbar-pill" data-a="zin">Zoom in</button>'
        + '<button class="toolbar-pill" data-a="fit">' + icon('target', 14) + 'Fit</button>'
        + '<button class="toolbar-pill pgx-lm-live" data-a="live"><span class="dot dot-green" data-ref="livedot"></span>Live updates</button>');
      root.appendChild(page);
      const scroll = page.querySelector('.pg-scroll');

      const canvas = el('<div class="pgx-lm-canvas"><div class="pgx-lm-world">'
        + '<svg class="pgx-lm-svg" aria-hidden="true">'
        + LM_EDGES.map((e, i) => '<path class="pgx-lm-edge tone-' + e[2] + '" data-i="' + i + '"></path>').join('')
        + '</svg></div>'
        + '<div class="pgx-lm-legend">' + D.network.legend.map((l) => '<span class="pgx-l-lg"><span class="dot dot-' + l[1] + '"></span>' + esc(l[0]) + '</span>').join('') + '</div>'
        + '<div class="pgx-lm-zoomchip" data-ref="zoom">100%</div>'
        + '</div>');
      scroll.appendChild(canvas);
      const world = canvas.querySelector('.pgx-lm-world');
      const svg = canvas.querySelector('.pgx-lm-svg');
      const edgeEls = Array.prototype.slice.call(svg.querySelectorAll('.pgx-lm-edge'));

      // nodes
      const nodeEls = {};
      nodes.forEach((n) => {
        const nb = el('<button class="pgx-lm-node ' + n.health + (n.degraded ? ' degraded' : '') + '" data-id="' + n.id + '" style="left:clamp(78px, ' + n.x + '%, calc(100% - 78px));top:clamp(26px, ' + n.y + '%, calc(100% - 26px))">'
          + '<span class="pgx-lm-box"><span class="ic-circle ' + (IC_TONE[n.health] || 'ic-blue') + '">' + icon(n.icon, 15) + '</span>'
          + '<span class="pgx-lm-txt"><b>' + esc(n.label) + '</b><i>' + esc(n.sub) + '</i></span></span></button>');
        world.appendChild(nb);
        nodeEls[n.id] = nb;
        nb.addEventListener('mouseenter', (e) => { hover(n.id); showTip('<b>' + esc(n.label) + '</b> · ' + esc(n.sub), e); });
        nb.addEventListener('mousemove', moveTip);
        nb.addEventListener('mouseleave', () => { hover(null); hideTip(); });
        nb.addEventListener('click', () => goTracesFiltered(n.label));
      });
      function hover(id) {
        canvas.classList.toggle('dimmed', !!id);
        edgeEls.forEach((p) => {
          const e = LM_EDGES[+p.dataset.i];
          p.classList.toggle('rel', !!id && (e[0] === id || e[1] === id));
        });
        Object.keys(nodeEls).forEach((k) => {
          const linked = LM_EDGES.some((e) => (e[0] === id && e[1] === k) || (e[1] === id && e[0] === k));
          nodeEls[k].classList.toggle('rel', !id || k === id || linked);
        });
      }

      // ---- geometry: measure node anchors at scale 1, build bezier edges ----
      let geo = []; // [{p0,c1,c2,p1,dur,len}]
      function draw() {
        const wr = world.getBoundingClientRect();
        if (!wr.width || !wr.height) return;
        const s = view.s || 1;
        const box = {};
        nodes.forEach((n) => {
          const r = nodeEls[n.id].querySelector('.pgx-lm-box').getBoundingClientRect();
          box[n.id] = {
            l: (r.left - wr.left) / s, r: (r.right - wr.left) / s,
            t: (r.top - wr.top) / s, b: (r.bottom - wr.top) / s,
            cy: (r.top + r.height / 2 - wr.top) / s,
          };
        });
        geo = LM_EDGES.map((e, i) => {
          const a = box[e[0]], b = box[e[1]];
          const p0 = { x: a.r, y: a.cy }, p1 = { x: b.l, y: b.cy };
          const mx = (p0.x + p1.x) / 2;
          const c1 = { x: mx + 14, y: p0.y }, c2 = { x: mx - 14, y: p1.y };
          let len = 0, px = p0.x, py = p0.y;
          for (let k = 1; k <= 8; k++) {
            const q = bez({ p0, c1, c2, p1 }, k / 8);
            len += Math.hypot(q.x - px, q.y - py); px = q.x; py = q.y;
          }
          edgeEls[i].setAttribute('d', 'M ' + p0.x.toFixed(1) + ' ' + p0.y.toFixed(1)
            + ' C ' + c1.x.toFixed(1) + ' ' + c1.y.toFixed(1) + ', ' + c2.x.toFixed(1) + ' ' + c2.y.toFixed(1) + ', ' + p1.x.toFixed(1) + ' ' + p1.y.toFixed(1));
          return { p0, c1, c2, p1, len, dur: 2.2 + len / 240 };
        });
      }
      function bez(g, t) {
        const u = 1 - t;
        return {
          x: u * u * u * g.p0.x + 3 * u * u * t * g.c1.x + 3 * u * t * t * g.c2.x + t * t * t * g.p1.x,
          y: u * u * u * g.p0.y + 3 * u * u * t * g.c1.y + 3 * u * t * t * g.c2.y + t * t * t * g.p1.y,
        };
      }

      // ---- flow particles (rAF along the beziers) ----
      const parts = []; // {el, ei, t, speed}
      const SVGNS = 'http://www.w3.org/2000/svg';
      const rr = rngFrom(777001);
      LM_EDGES.forEach((e, i) => {
        const n = e[2] === 'gray' ? 2 : 3;
        for (let k = 0; k < n; k++) {
          const c = document.createElementNS(SVGNS, 'circle');
          c.setAttribute('class', 'pgx-lm-pdot tone-' + e[2]);
          c.setAttribute('r', e[2] === 'gray' ? 3 : 3.6);
          svg.appendChild(c);
          parts.push({ el: c, ei: i, t: rr(), speed: 0.85 + rr() * 0.4 });
        }
      });
      let liveOn = !OIQ.freeze;
      let lastT = 0;
      function tick(now) {
        const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i], g = geo[p.ei];
          if (!g) continue;
          p.t = (p.t + dt * p.speed / g.dur) % 1;
          const q = bez(g, p.t);
          p.el.setAttribute('cx', q.x.toFixed(1));
          p.el.setAttribute('cy', q.y.toFixed(1));
        }
        clean.raf = requestAnimationFrame(tick);
      }
      function setLive(on) {
        liveOn = on;
        if (clean.raf) { cancelAnimationFrame(clean.raf); clean.raf = 0; }
        if (on) { lastT = performance.now(); clean.raf = requestAnimationFrame(tick); }
        parts.forEach((p) => { p.el.style.opacity = on ? '' : '0.25'; });
        const dot = page.querySelector('[data-ref="livedot"]');
        dot.className = 'dot ' + (on ? 'dot-green' : 'dot-gray');
        page.querySelector('.pgx-lm-live').classList.toggle('off', !on);
      }

      // ---- zoom / fit / pan ----
      const view = { s: 1, tx: 0, ty: 0 };
      function applyView() {
        world.style.transform = 'translate(' + view.tx.toFixed(1) + 'px,' + view.ty.toFixed(1) + 'px) scale(' + view.s.toFixed(3) + ')';
        canvas.querySelector('[data-ref="zoom"]').textContent = Math.round(view.s * 100) + '%';
      }
      function zoom(k) {
        const r = canvas.getBoundingClientRect();
        const ns = Math.max(0.5, Math.min(2, view.s * k));
        const kk = ns / view.s;
        view.tx = r.width / 2 - kk * (r.width / 2 - view.tx);
        view.ty = r.height / 2 - kk * (r.height / 2 - view.ty);
        view.s = ns;
        applyView();
      }
      function fit() { view.s = 1; view.tx = 0; view.ty = 0; applyView(); }
      page.querySelector('[data-a="zout"]').addEventListener('click', () => zoom(1 / 1.25));
      page.querySelector('[data-a="zin"]').addEventListener('click', () => zoom(1.25));
      page.querySelector('[data-a="fit"]').addEventListener('click', () => { fit(); toast('View reset to fit', 'info'); });
      page.querySelector('[data-a="live"]').addEventListener('click', () => {
        setLive(!liveOn);
        toast(liveOn ? 'Live updates resumed' : 'Live updates paused', liveOn ? 'success' : 'warn');
      });
      let pan = null;
      const onDown = (e) => {
        if (e.target.closest('.pgx-lm-node') || e.target.closest('.pgx-lm-legend')) return;
        pan = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
        canvas.classList.add('grabbing');
      };
      const onMove = (e) => {
        if (!pan) return;
        view.tx = pan.tx + (e.clientX - pan.x);
        view.ty = pan.ty + (e.clientY - pan.y);
        applyView();
      };
      const onUp = () => { pan = null; canvas.classList.remove('grabbing'); };
      canvas.addEventListener('pointerdown', onDown);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      clean.unbinds.add(() => {
        canvas.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      });

      const ro = new ResizeObserver(draw);
      ro.observe(canvas);
      nodes.forEach((n) => ro.observe(nodeEls[n.id]));
      clean.robs.add(ro);
      requestAnimationFrame(draw);
      later(draw, 350);
      applyView();
      setLive(liveOn);
    },
    unmount() { clearAll(); },
  });

  /* ======================================================================
     PAGE 3 · INCIDENTS
  ====================================================================== */
  OIQ.registerPage('incidents', {
    title: 'Active incidents',
    mount(root) {
      const crit = D.incidents.filter((i) => i.sev === 'critical').length;
      const page = pageShell('pgx-incidents', 'Active incidents',
        esc(D.incidents.length + ' open · ' + crit + ' critical · on-call: ' + D.me.team),
        '<button class="pill-btn" data-act="ackall">' + icon('check', 15) + 'Acknowledge all</button>');
      root.appendChild(page);
      const scroll = page.querySelector('.pg-scroll');

      const list = el('<div class="pgx-inc-list"></div>');
      scroll.appendChild(list);
      const rows = [];

      D.incidents.forEach((inc, i) => {
        const tone = inc.sev === 'critical' ? 'red' : 'amber';
        const row = el('<div class="pgx-inc-row tone-' + tone + '" style="--d:' + (i * 50) + 'ms">'
          + '<button class="pgx-inc-head">'
          + '<span class="badge ' + (tone === 'red' ? 'badge-red' : 'badge-amber') + '" data-ref="sev"><span class="dot dot-' + tone + '"></span>' + (tone === 'red' ? 'Critical' : 'Warning') + '</span>'
          + '<span class="pgx-inc-id">' + esc(inc.id) + '</span>'
          + '<span class="pgx-inc-main"><b>' + esc(inc.title) + '</b><i>' + esc(inc.where) + '</i></span>'
          + '<span class="pgx-inc-age">' + esc(inc.age) + '</span>'
          + '<span class="pgx-inc-chev">' + icon('chevron-down', 16) + '</span>'
          + '</button>'
          + '<div class="pgx-inc-body"><div class="pgx-inc-inner">'
          + '<p>' + esc(inc.desc) + '</p>'
          + '<div class="lbl">Timeline</div>'
          + '<div class="pgx-tl">' + inc.timeline.map((t, k) => '<div class="pgx-tl-row"><span class="pgx-tl-time">' + esc(t[0]) + '</span>'
            + '<span class="pgx-tl-dot ' + tone + (k === inc.timeline.length - 1 ? ' last' : '') + '"></span>'
            + '<span class="pgx-tl-tx">' + esc(t[1]) + '</span></div>').join('') + '</div>'
          + '<div class="pgx-inc-actions">'
          + '<button class="btn-primary" data-a="trace">' + icon('arrow-right', 15) + 'View trace</button>'
          + '<button class="pill-btn" data-a="fix">' + icon('bolt', 14) + 'Create fix</button>'
          + '</div>'
          + '</div></div>'
          + '</div>');
        const body = row.querySelector('.pgx-inc-body');
        row.querySelector('.pgx-inc-head').addEventListener('click', () => {
          const open = row.classList.toggle('open');
          body.style.maxHeight = open ? body.scrollHeight + 'px' : '0px';
        });
        row.querySelector('[data-a="trace"]').addEventListener('click', (e) => {
          e.stopPropagation();
          OIQ.go('#/trace/' + inc.trace);
        });
        row.querySelector('[data-a="fix"]').addEventListener('click', (e) => {
          e.stopPropagation();
          toast('Fix drafted for ' + inc.id + ' — handed to the on-call queue (demo)', 'success');
        });
        rows.push(row);
        list.appendChild(row);
      });

      page.querySelector('[data-act="ackall"]').addEventListener('click', (e) => {
        const btn = e.currentTarget;
        const allAcked = rows.every((r) => r.classList.contains('acked'));
        rows.forEach((r) => setAcked(r, !allAcked));
        btn.classList.toggle('gray', !allAcked);
        toast(allAcked ? 'Incidents re-opened' : 'All incidents acknowledged', allAcked ? 'info' : 'success');
      });
      function setAcked(row, on) {
        row.classList.toggle('acked', on);
        const sev = row.querySelector('[data-ref="sev"]');
        if (on) {
          sev.className = 'badge badge-gray';
          sev.innerHTML = '<span class="dot dot-gray"></span>Acknowledged';
        } else {
          const tone = row.classList.contains('tone-red') ? 'red' : 'amber';
          sev.className = 'badge ' + (tone === 'red' ? 'badge-red' : 'badge-amber');
          sev.innerHTML = '<span class="dot dot-' + tone + '"></span>' + (tone === 'red' ? 'Critical' : 'Warning');
        }
      }

      // resolved today (static demo archive — see completion report)
      const resWrap = el('<div><div class="lbl pgx-res-label">Resolved today</div><div class="pgx-res"></div></div>');
      const resBox = resWrap.querySelector('.pgx-res');
      [
        { t: 'Token budget exceeded — Data Enrichment', m: 'Resolved 08:52 · auto-remediated by budget guard · 23m open' },
        { t: 'Webhook retry storm — Billing webhooks', m: 'Resolved 07:15 · provider recovered · backoff raised to 30s' },
      ].forEach((r) => {
        const row = el('<button class="pgx-res-row">'
          + '<span class="ic-circle ic-gray">' + icon('check', 15) + '</span>'
          + '<span class="pgx-res-main"><b>' + esc(r.t) + '</b><i>' + esc(r.m) + '</i></span>'
          + '<span class="badge badge-gray">Resolved</span>'
          + '</button>');
        row.addEventListener('click', () => toast('Resolved incidents are read-only in this demo', 'info'));
        resBox.appendChild(row);
      });
      scroll.appendChild(resWrap);
    },
    unmount() { clearAll(); },
  });

  /* ======================================================================
     PAGE 4 · INSIGHTS
  ====================================================================== */
  const RANGE_FACTOR = { '7 days': 0.23, '30 days': 1, '90 days': 2.9 };
  OIQ.registerPage('insights', {
    title: 'Insights',
    mount(root) {
      const st = { range: '30 days' };
      const page = pageShell('pgx-insights', 'Insights', 'Cost, reliability and usage across the platform',
        '<button class="toolbar-pill" data-ref="range"><span data-ref="rangelabel">30 days</span>' + icon('chevron-down', 15) + '</button>');
      root.appendChild(page);
      const scroll = page.querySelector('.pg-scroll');

      const grid = el('<div class="pgx-is-grid"></div>');
      scroll.appendChild(grid);

      /* ---- cost trend (big card) ---- */
      const TW = 820, TH = 170, TP = { l: 52, r: 16, t: 14, b: 26 };
      const trend = el('<section class="card pgx-card pgx-is-trend">'
        + '<div class="pgx-card-head"><div><h2 class="card-title">Cost trend</h2>'
        + '<div class="sub">Platform spend per day · <span data-ref="cap">30 days</span></div></div>'
        + '<div class="pgx-trend-total"><b data-ref="total">$0</b><span data-ref="delta"></span></div></div>'
        + '<div class="pgx-trend-wrap"><svg data-ref="chart" viewBox="0 0 ' + TW + ' ' + TH + '" preserveAspectRatio="xMidYMid meet"></svg></div>'
        + '</section>');
      grid.appendChild(trend);
      const tsvg = trend.querySelector('[data-ref="chart"]');
      const gid = 'xtrend' + (++uid);
      function trendBase() {
        return '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">'
          + '<stop class="sa" offset="0" stop-opacity="0.2"></stop><stop class="sb" offset="1" stop-opacity="0"></stop>'
          + '</linearGradient></defs>'
          + [0.25, 0.5, 0.75].map((f) => {
            const y = TP.t + f * (TH - TP.t - TP.b);
            return '<line class="pgx-grid" x1="' + TP.l + '" y1="' + y.toFixed(1) + '" x2="' + (TW - TP.r) + '" y2="' + y.toFixed(1) + '"></line>'
              + '<text class="pgx-ax" x="' + (TP.l - 10) + '" y="' + (y + 3.5).toFixed(1) + '" text-anchor="end"></text>';
          }).join('')
          + '<path class="pgx-trend-area" fill="url(#' + gid + ')"></path>'
          + '<path class="pgx-trend-line" pathLength="100"></path>'
          + '<line class="pgx-cursor" y1="' + TP.t + '" y2="' + (TH - TP.b) + '" opacity="0"></line>'
          + '<circle class="pgx-cursor-dot" r="4" opacity="0"></circle>'
          + '<rect class="pgx-hover" x="' + TP.l + '" y="' + TP.t + '" width="' + (TW - TP.l - TP.r) + '" height="' + (TH - TP.t - TP.b) + '" fill="transparent"></rect>';
      }
      tsvg.innerHTML = trendBase();
      const tLine = tsvg.querySelector('.pgx-trend-line');
      const tArea = tsvg.querySelector('.pgx-trend-area');
      const cursor = tsvg.querySelector('.pgx-cursor');
      const cursorDot = tsvg.querySelector('.pgx-cursor-dot');
      let series = [], geoPts = [];

      function costSeries(rangeKey) {
        const end = D.costs[rangeKey].reduce((s, r) => s + r[1], 0);
        const r = rngFrom(hashStr('costtrend:' + rangeKey));
        const pts = [end];
        let v = end;
        for (let i = 1; i < 30; i++) {
          v = v / (1 + (r() * 0.035 - 0.008));
          pts.push(v);
        }
        pts.reverse();
        return pts.map((x) => Math.round(x));
      }
      function drawTrend(animate) {
        series = costSeries(st.range);
        const lo = Math.min.apply(null, series), hi = Math.max.apply(null, series);
        const pad = (hi - lo) * 0.15 || 1;
        const y0 = lo - pad, y1 = hi + pad;
        const n = series.length;
        geoPts = series.map((v, i) => [
          TP.l + i * (TW - TP.l - TP.r) / (n - 1),
          TP.t + (1 - (v - y0) / (y1 - y0)) * (TH - TP.t - TP.b),
        ]);
        const d = smoothPath(geoPts);
        tLine.setAttribute('d', d);
        tLine.classList.remove('drawn');
        if (animate && !OIQ.freeze) {
          later(() => tLine.classList.add('drawn'), 30);
        } else tLine.classList.add('drawn');
        tArea.setAttribute('d', d + ' L ' + geoPts[n - 1][0].toFixed(1) + ' ' + (TH - TP.b) + ' L ' + TP.l + ' ' + (TH - TP.b) + ' Z');
        const days = { '7 days': 7, '30 days': 30, '90 days': 90 }[st.range];
        tsvg.querySelectorAll('.pgx-xlab').forEach((tx) => tx.remove());
        tsvg.querySelectorAll('.pgx-ax:not(.pgx-xlab)').forEach((tx, i) => {
          const f = [0.25, 0.5, 0.75][i];
          tx.textContent = abbrevMoney(Math.round(y0 + (1 - f) * (y1 - y0)));
        });
        [0, 0.5, 1].forEach((f) => {
          const i = Math.round(f * (n - 1));
          const t = el('<text class="pgx-ax pgx-xlab" x="' + geoPts[i][0].toFixed(1) + '" y="' + (TH - 8) + '" text-anchor="middle">' + (f === 1 ? 'today' : '-' + Math.round((1 - f) * days) + 'd') + '</text>');
          tsvg.appendChild(t);
        });
        const end = series[n - 1], start = series[0];
        trend.querySelector('[data-ref="total"]').textContent = fmt.money(end);
        const chg = start ? (end - start) / start * 100 : 0;
        const up = chg >= 0;
        trend.querySelector('[data-ref="delta"]').textContent = (up ? '+' : '') + chg.toFixed(1) + '% vs start of period';
        trend.querySelector('[data-ref="delta"]').style.color = up ? 'var(--red)' : 'var(--green)';
        trend.querySelector('[data-ref="cap"]').textContent = st.range;
      }
      tsvg.querySelector('.pgx-hover').addEventListener('mousemove', (e) => {
        const r = tsvg.getBoundingClientRect();
        const sx = TW / r.width;
        const mx = (e.clientX - r.left) * sx;
        let idx = Math.round((mx - TP.l) / ((TW - TP.l - TP.r) / (series.length - 1)));
        idx = Math.max(0, Math.min(series.length - 1, idx));
        const p = geoPts[idx]; if (!p) return;
        cursor.setAttribute('x1', p[0].toFixed(1)); cursor.setAttribute('x2', p[0].toFixed(1));
        cursor.setAttribute('opacity', '1');
        cursorDot.setAttribute('cx', p[0].toFixed(1)); cursorDot.setAttribute('cy', p[1].toFixed(1));
        cursorDot.setAttribute('opacity', '1');
        const days = { '7 days': 7, '30 days': 30, '90 days': 90 }[st.range];
        const day = new Date(Date.now() - (series.length - 1 - idx) * (days / series.length) * 86400000);
        const dLabel = (day.getMonth() + 1) + '/' + day.getDate();
        showTip(esc(dLabel) + ' · <b>' + fmt.money(series[idx]) + '</b> spend', e);
      });
      tsvg.querySelector('.pgx-hover').addEventListener('mouseleave', () => {
        cursor.setAttribute('opacity', '0'); cursorDot.setAttribute('opacity', '0'); hideTip();
      });

      /* ---- runs by workflow ---- */
      const runsCard = el('<section class="card pgx-card"><div class="pgx-card-head"><div><h2 class="card-title">Runs by workflow</h2>'
        + '<div class="sub" data-ref="runs-sub">All workflows · 30 days</div></div></div><div class="pgx-runs"></div></section>');
      grid.appendChild(runsCard);
      const runsBox = runsCard.querySelector('.pgx-runs');
      const runRows = aggRunsByWorkflow().map((m) => {
        const row = el('<div class="pgx-bar-row"><div class="pgx-bar-top"><span>' + esc(m.name) + '</span><b data-ref="v">' + fmt.num(m.count) + '</b></div>'
          + '<div class="pgx-bar-track"><div class="pgx-bar-fill tone-blue"></div></div></div>');
        const track = row.querySelector('.pgx-bar-track');
        track.addEventListener('mouseenter', (e) => showTip(esc(m.name) + ' · <b>' + row.querySelector('[data-ref="v"]').textContent + '</b> runs', e));
        track.addEventListener('mousemove', moveTip);
        track.addEventListener('mouseleave', hideTip);
        runsBox.appendChild(row);
        return { row, fill: row.querySelector('.pgx-bar-fill'), val: row.querySelector('[data-ref="v"]'), base: Math.max(1, m.count) };
      });

      /* ---- token usage donut ---- */
      const tok = aggTokensByModel();
      const donutCard = el('<section class="card pgx-card"><div class="pgx-card-head"><div><h2 class="card-title">Token usage</h2>'
        + '<div class="sub">By model family · <span data-ref="tok-range">30 days</span></div></div></div>'
        + '<div class="pgx-donut-wrap"><svg viewBox="0 0 200 200" data-ref="donut"></svg><div class="pgx-dl" data-ref="dl"></div></div></section>');
      grid.appendChild(donutCard);
      const dsvg = donutCard.querySelector('[data-ref="donut"]');
      const dR = 62, dC = 2 * Math.PI * dR;
      const MODELS = [['GPT-5', 'blue'], ['Claude', 'purple'], ['Gemini', 'green']];
      dsvg.innerHTML = '<circle class="pgx-donut-track" cx="100" cy="100" r="' + dR + '"></circle>'
        + '<g transform="rotate(-90 100 100)">'
        + MODELS.map(([m, tone]) => '<circle class="pgx-donut-seg tone-' + tone + '" data-m="' + m + '" cx="100" cy="100" r="' + dR + '"></circle>').join('')
        + '</g>'
        + '<text class="pgx-donut-big" x="100" y="96" text-anchor="middle"></text>'
        + '<text class="pgx-donut-cap" x="100" y="118" text-anchor="middle">tokens</text>';
      const segs = {}; MODELS.forEach(([m]) => { segs[m] = dsvg.querySelector('[data-m="' + m + '"]'); });
      const dlBox = donutCard.querySelector('[data-ref="dl"]');

      /* ---- failure breakdown ---- */
      const failCard = el('<section class="card pgx-card pgx-is-fail"><div class="pgx-card-head"><div><h2 class="card-title">Failure breakdown</h2>'
        + '<div class="sub" data-ref="fail-sub">Root causes across failed runs · 30 days</div></div></div><div class="pgx-fail-grid"></div></section>');
      grid.appendChild(failCard);
      const failGrid = failCard.querySelector('.pgx-fail-grid');
      const failRows = FAIL_CATS.map(([cat, tone]) => {
        const row = el('<div class="pgx-bar-row"><div class="pgx-bar-top"><span>' + esc(cat) + '</span><b data-ref="v">0</b></div>'
          + '<div class="pgx-bar-track"><div class="pgx-bar-fill tone-' + tone + '"></div></div></div>');
        const track = row.querySelector('.pgx-bar-track');
        track.addEventListener('mousemove', (e) => {
          showTip(esc(cat) + ' · <b>' + row.querySelector('[data-ref="v"]').textContent + '</b> failed runs', e);
        });
        track.addEventListener('mouseleave', hideTip);
        failGrid.appendChild(row);
        return { row, fill: row.querySelector('.pgx-bar-fill'), val: row.querySelector('[data-ref="v"]'), cat };
      });

      /* ---- range switching ---- */
      const donutState = { acc: 1 };
      function update(initial) {
        drawTrend(!initial);
        const f = RANGE_FACTOR[st.range];
        const maxRun = Math.max.apply(null, runRows.map((r) => Math.max(1, Math.round(r.base * f))));
        runRows.forEach((r) => {
          const v = Math.max(1, Math.round(r.base * f));
          r.val.textContent = fmt.num(v);
          r.fill.style.width = Math.max(2, v / maxRun * 100).toFixed(1) + '%';
        });
        runsCard.querySelector('[data-ref="runs-sub"]').textContent = 'All workflows · ' + st.range;
        const total = Math.round(tok.total * f);
        let acc = 0;
        MODELS.forEach(([m]) => { acc += Math.max(1, Math.round(tok.shares[m] * f)); });
        acc = acc || 1;
        donutState.acc = acc;
        let off = 0;
        MODELS.forEach(([m]) => {
          const v = Math.max(1, Math.round(tok.shares[m] * f));
          const frac = v / acc;
          segs[m].style.strokeDasharray = (frac * dC).toFixed(1) + ' ' + dC.toFixed(1);
          segs[m].style.strokeDashoffset = (-off * dC).toFixed(1);
          off += frac;
        });
        dsvg.querySelector('.pgx-donut-big').textContent = abbrevTok(total);
        donutCard.querySelector('[data-ref="tok-range"]').textContent = st.range;
        dlBox.innerHTML = MODELS.map(([m, tone]) => {
          const v = Math.max(1, Math.round(tok.shares[m] * f));
          return '<div class="pgx-dl-row"><span class="dot dot-' + tone + '"></span><span class="pgx-dl-name">' + esc(m) + '</span>'
            + '<b>' + abbrevTok(v) + '</b><span class="pgx-dl-pct">' + Math.round(v / acc * 100) + '%</span></div>';
        }).join('');
        const fa = aggFailures();
        const maxF = Math.max(1, Math.max.apply(null, FAIL_CATS.map(([c]) => Math.round(fa.counts[c] * f))));
        failRows.forEach((r) => {
          const v = Math.round(fa.counts[r.cat] * f);
          r.val.textContent = fmt.num(v);
          r.fill.style.width = Math.max(v ? 3 : 0, v / maxF * 100).toFixed(1) + '%';
        });
        failCard.querySelector('[data-ref="fail-sub"]').textContent = 'Root causes across ' + fmt.num(Math.round(fa.failed * f)) + ' failed runs · ' + st.range;
      }
      MODELS.forEach(([m]) => {
        segs[m].addEventListener('mouseenter', (e) => {
          const v = Math.max(1, Math.round(tok.shares[m] * RANGE_FACTOR[st.range]));
          showTip(esc(m) + ' · <b>' + abbrevTok(v) + '</b> tokens · ' + Math.round(v / donutState.acc * 100) + '%', e);
        });
        segs[m].addEventListener('mousemove', moveTip);
        segs[m].addEventListener('mouseleave', hideTip);
      });

      const rangeBtn = page.querySelector('[data-ref="range"]');
      rangeBtn.addEventListener('click', () => {
        OIQ.ui.dropdown(rangeBtn, ['7 days', '30 days', '90 days'].map((k) => ({ label: k, value: k, checked: st.range === k })), (it) => {
          if (it.value === st.range) return;
          st.range = it.value;
          page.querySelector('[data-ref="rangelabel"]').textContent = it.value;
          update(false);
        });
      });
      update(true);
    },
    unmount() { clearAll(); },
  });
})();
