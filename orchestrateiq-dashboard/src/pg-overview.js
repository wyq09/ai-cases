(function () {
  const OIQ = window.OIQ;
  const D = window.OIQ_DATA;
  const icon = (n, s) => window.__ICON_LIB.icon(n, s);
  const el = (h) => OIQ.el(h);
  const esc = (s) => OIQ.esc(s);
  let uidSeq = 0;

  /* ============ per-mount cleanup registry (single page instance at a time) ============ */
  const clean = { intervals: new Set(), timeouts: new Set(), raf: 0, robs: new Set(), unbinds: new Set(), modals: new Set() };
  function clearAll() {
    clean.intervals.forEach(clearInterval); clean.intervals.clear();
    clean.timeouts.forEach(clearTimeout); clean.timeouts.clear();
    if (clean.raf) cancelAnimationFrame(clean.raf);
    clean.robs.forEach((ro) => ro.disconnect()); clean.robs.clear();
    clean.unbinds.forEach((f) => { try { f(); } catch (e) {} }); clean.unbinds.clear();
    clean.modals.forEach((c) => { try { c(); } catch (e) {} }); clean.modals.clear();
    hideTip();
  }

  /* ============ page-scoped tooltip (reuses shared .tip styling) ============ */
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

  // OIQ.ui.toast is not exported by current core.js — use it when available, fall back to a local twin.
  function toast(msg, kind) {
    if (OIQ.ui && typeof OIQ.ui.toast === 'function') return OIQ.ui.toast(msg, kind);
    const root = document.getElementById('toast-root');
    if (!root) return;
    const t = el('<div class="toast ' + (kind || 'info') + '"><span>' + icon('spark', 15) + '</span><span>' + esc(msg) + '</span></div>');
    root.appendChild(t);
    const kill = () => { t.classList.add('out'); setTimeout(() => t.remove(), 240); };
    setTimeout(kill, 3200);
  }

  /* ============ helpers ============ */
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

  // rescale a formatted value ('96.4%' / '$8,421' / '2.8s' / 186) for the global range
  function rescaleText(txt, key) {
    const m = String(txt).match(/^([^0-9]*)([\d][\d,]*(?:\.\d+)?)(.*)$/);
    if (!m) return txt;
    const val = parseFloat(m[2].replace(/,/g, ''));
    const nv = D.rescale(val, key);
    if (m[3].charAt(0) === '%') return Math.min(100, nv) + '%';
    if (m[1].indexOf('$') >= 0) return D.fmt.money(nv) + m[3];
    return m[1] + D.fmt.num(nv) + m[3];
  }
  function fmtRowVal(v, key) {
    if (typeof v === 'number') return String(key ? D.rescale(v, key) : v);
    return key ? rescaleText(v, key) : String(v);
  }

  /* ============ sparkline ============ */
  function buildSpark(card) {
    const W = 128, Hh = 58, px = 8, py = 12;
    const line = card.line;
    const last = line[line.length - 1];
    const pts = line.map((v, i) => [px + i * (W - 2 * px) / (line.length - 1), py + (1 - v / 100) * (Hh - 2 * py)]);
    const g = 'ovsg' + (++uidSeq);
    const dLine = smoothPath(pts);
    const dArea = dLine + ' L ' + (W - px) + ' ' + (Hh - 4) + ' L ' + px + ' ' + (Hh - 4) + ' Z';
    const svg = el('<svg class="tone-' + card.tone + '" viewBox="0 0 ' + W + ' ' + Hh + '" aria-hidden="true">'
      + '<defs><linearGradient id="' + g + '" x1="0" y1="0" x2="0" y2="1">'
      + '<stop class="sa" offset="0" stop-opacity="0.22"></stop><stop class="sb" offset="1" stop-opacity="0"></stop>'
      + '</linearGradient></defs>'
      + '<path class="ov-spark-area" d="' + dArea + '" fill="url(#' + g + ')"></path>'
      + '<path class="ov-spark-line" d="' + dLine + '" pathLength="100"></path>'
      + '<circle class="ov-spark-end" cx="' + pts[pts.length - 1][0].toFixed(1) + '" cy="' + pts[pts.length - 1][1].toFixed(1) + '" r="3.4"></circle>'
      + pts.map((p, i) => '<circle class="ov-spark-pt" data-i="' + i + '" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="8"></circle>').join('')
      + '</svg>');
    function tipHtml(i) {
      const m = String(card.value).match(/^([^0-9]*)([\d][\d,]*(?:\.\d+)?)(.*)$/);
      if (!m || !last) return esc(card.label);
      const base = parseFloat(m[2].replace(/,/g, ''));
      const scaled = base * line[i] / last;
      let out;
      if (m[1].indexOf('$') >= 0) out = D.fmt.money(Math.round(scaled));
      else if (m[3].charAt(0) === '%') out = scaled.toFixed(1) + '%';
      else out = D.fmt.num(Math.round(scaled));
      return esc(card.label) + ' <b>' + out + '</b>';
    }
    svg.querySelectorAll('.ov-spark-pt').forEach((c) => {
      const i = +c.dataset.i;
      c.addEventListener('mouseenter', (e) => { c.classList.add('on'); showTip(tipHtml(i), e); });
      c.addEventListener('mousemove', moveTip);
      c.addEventListener('mouseleave', () => { c.classList.remove('on'); hideTip(); });
    });
    return svg;
  }

  /* ============ live agent network canvas factory ============ */
  function createNet(host, opts) {
    const o = opts || {};
    const net = D.network;
    const uid = 'ovn' + (++uidSeq);
    const flowIdx = net.edges.findIndex((e) => e[2] === 'blue');
    const root = el('<div class="ov-net">'
      + '<svg class="ov-net-svg" aria-hidden="true">'
      + net.edges.map((e, i) => '<path id="' + uid + '-e' + i + '" class="ov-edge tone-' + e[2] + '" data-a="' + e[0] + '" data-b="' + e[1] + '"></path>').join('')
      + (OIQ.freeze || flowIdx < 0 ? '' : '<circle class="ov-flowdot" r="4"><animateMotion dur="2.6s" repeatCount="indefinite" rotate="0"><mpath href="#' + uid + '-e' + flowIdx + '"></mpath></animateMotion></circle>')
      + '</svg>'
      + '<div class="ov-legend">' + net.legend.map((l) => '<span class="ov-lg"><span class="dot dot-' + l[1] + '"></span>' + esc(l[0]) + '</span>').join('') + '</div>'
      + '</div>');
    root.style.height = (o.height || 300) + 'px';

    let hoverId = null, selId = null;
    const nodes = {};
    net.nodes.forEach((n) => {
      const nb = el('<button class="ov-node' + (n.degraded ? ' ov-node-degraded' : '') + '" data-id="' + n.id + '" style="left:clamp(86px, ' + n.x + '%, calc(100% - 86px));top:clamp(30px, ' + n.y + '%, calc(100% - 30px))">'
        + '<span class="ov-node-box"><span class="ic-circle ic-' + n.ic + '">' + icon(n.icon, 16) + '</span>'
        + '<span class="ov-node-txt"><b>' + esc(n.label) + '</b><i>' + esc(n.sub) + '</i></span></span>'
        + '</button>');
      root.appendChild(nb);
      nodes[n.id] = nb;
      nb.addEventListener('mouseenter', () => { hoverId = n.id; applyDim(); });
      nb.addEventListener('mouseleave', () => { hoverId = null; applyDim(); });
      nb.addEventListener('click', () => { if (o.onNodeClick) o.onNodeClick(n); });
    });
    const edgeEls = Array.prototype.slice.call(root.querySelectorAll('.ov-edge'));

    function applyDim() {
      const act = hoverId || selId;
      root.classList.toggle('dimmed', !!act);
      Object.keys(nodes).forEach((id) => {
        const linked = net.edges.some((e) => (e[0] === act && e[1] === id) || (e[1] === act && e[0] === id));
        nodes[id].classList.toggle('rel', !act || id === act || linked);
        nodes[id].classList.toggle('sel', !!selId && selId === id);
      });
      edgeEls.forEach((p) => p.classList.toggle('rel', !!act && (p.dataset.a === act || p.dataset.b === act)));
    }

    function draw() {
      const cr = root.getBoundingClientRect();
      if (!cr.width || !cr.height) return;
      net.edges.forEach((e, i) => {
        const ra = nodes[e[0]].querySelector('.ov-node-box').getBoundingClientRect();
        const rb = nodes[e[1]].querySelector('.ov-node-box').getBoundingClientRect();
        const x1 = ra.right - cr.left, y1 = ra.top - cr.top + ra.height / 2;
        const x2 = rb.left - cr.left, y2 = rb.top - cr.top + rb.height / 2;
        const mx = ((x1 + x2) / 2).toFixed(1);
        edgeEls[i].setAttribute('d', 'M ' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' C ' + mx + ' ' + y1.toFixed(1) + ', ' + mx + ' ' + y2.toFixed(1) + ', ' + x2.toFixed(1) + ' ' + y2.toFixed(1));
      });
    }
    const ro = new ResizeObserver(draw);
    ro.observe(root);
    Object.keys(nodes).forEach((k) => ro.observe(nodes[k]));
    clean.robs.add(ro);
    requestAnimationFrame(draw);
    host.appendChild(root);

    return {
      root,
      draw,
      setSelected(id) { selId = id; applyDim(); },
      getSelected() { return selId; },
      setTime(label) {
        const key = { 'Last 5 min': '30 min', 'Last 15 min': '1 h', 'Last 1 h': '24 h' }[label] || '30 min';
        net.nodes.forEach((n) => {
          const m = n.sub.match(/^([\d,]+) calls( · .*)?$/);
          if (!m) return;
          const v = D.rescale(parseInt(m[1].replace(/,/g, ''), 10), key);
          nodes[n.id].querySelector('.ov-node-txt i').textContent = D.fmt.num(v) + ' calls' + (m[2] || '');
        });
      },
      destroy() { ro.disconnect(); clean.robs.delete(ro); },
    };
  }

  /* ============ the page ============ */
  OIQ.registerPage('overview', {
    title: 'Overview',
    mount(root) {
      const H = D.kpi.health;
      const page = el('<div class="pg-overview' + (OIQ.freeze ? ' no-anim' : '') + '"></div>');
      root.appendChild(page);

      /* ---------- row 1 · health ---------- */
      const rowTop = el('<div class="ov-row-top"></div>');
      page.appendChild(rowTop);

      const health = el('<section class="card ov-card ov-health">'
        + '<div class="ov-head"><h2 class="card-title">Health</h2>'
        + '<span class="badge badge-green"><span class="dot dot-green"></span>Healthy</span></div>'
        + '<div class="ov-health-body"></div></section>');
      rowTop.appendChild(health);

      const gauge = el('<div class="ov-gauge">'
        + '<svg viewBox="0 0 200 114" aria-hidden="true">'
        + '<defs><linearGradient id="ovGaugeGrad" x1="0" y1="0" x2="1" y2="0">'
        + '<stop class="ga" offset="0"></stop><stop class="gb" offset="1"></stop></linearGradient></defs>'
        + '<path class="ov-gauge-track" d="M 18 100 A 82 82 0 0 1 182 100"></path>'
        + '<path class="ov-gauge-arc" d="M 18 100 A 82 82 0 0 1 182 100" pathLength="100" style="stroke-dasharray:.5 100"></path>'
        + '<circle class="ov-gauge-knob" r="7" cx="18" cy="100"></circle>'
        + '</svg>'
        + '<div class="ov-gauge-num"><b>0</b><span class="ov-gauge-cap">of 100 · ' + esc(H.delta) + '</span></div>'
        + '</div>');
      const healthBody = health.querySelector('.ov-health-body');
      healthBody.appendChild(gauge);
      const gaugeArc = gauge.querySelector('.ov-gauge-arc');
      const gaugeKnob = gauge.querySelector('.ov-gauge-knob');
      const gaugeNum = gauge.querySelector('.ov-gauge-num b');
      let gaugeVal = 0;
      function setGauge(pct) {
        gaugeArc.style.strokeDasharray = Math.max(.5, pct).toFixed(2) + ' 100';
        const a = Math.PI * (1 - pct / 100);
        gaugeKnob.setAttribute('cx', (100 + 82 * Math.cos(a)).toFixed(2));
        gaugeKnob.setAttribute('cy', (100 - 82 * Math.sin(a)).toFixed(2));
        gaugeNum.textContent = Math.round(pct);
      }
      function animateGauge(to, dur) {
        if (clean.raf) cancelAnimationFrame(clean.raf);
        if (OIQ.freeze || dur <= 0) { gaugeVal = to; setGauge(to); return; }
        const from = gaugeVal, t0 = performance.now();
        const step = (now) => {
          const t = Math.min(1, (now - t0) / dur);
          const e = 1 - Math.pow(1 - t, 3);
          gaugeVal = from + (to - from) * e;
          setGauge(gaugeVal);
          if (t < 1) clean.raf = requestAnimationFrame(step);
        };
        clean.raf = requestAnimationFrame(step);
      }

      const rowsWrap = el('<div class="ov-health-rows"></div>');
      const rowSvEls = [];
      H.rows.forEach((r) => {
        const row = el('<div class="stat-row"><span class="sk">' + esc(r[0]) + '</span><span class="sv">' + esc(fmtRowVal(r[1], null)) + '</span></div>');
        rowSvEls.push(row.querySelector('.sv'));
        rowsWrap.appendChild(row);
      });
      healthBody.appendChild(rowsWrap);

      /* ---------- row 1 · 2x2 KPI ---------- */
      const kwrap = el('<section class="card ov-kpis"></section>');
      rowTop.appendChild(kwrap);
      const sparkEls = [], kpiValueEls = [];
      D.kpi.cards.forEach((c) => {
        const k = el('<div class="ov-kpi">'
          + '<span class="ic-circle ic-' + c.ic + '">' + icon(c.icon, 19) + '</span>'
          + '<div class="ov-kpi-info">'
          + '<div class="ov-kpi-label">' + esc(c.label) + '</div>'
          + '<div class="ov-kpi-value">' + esc(c.value) + '</div>'
          + '<div class="ov-kpi-delta"><span class="badge badge-' + c.deltaTone + '"><span class="dot dot-' + c.deltaTone + '"></span>' + esc(c.delta) + '</span>'
          + '<span class="ov-kpi-suffix">' + esc(c.suffix) + '</span></div>'
          + '</div>'
          + '<div class="ov-spark"></div></div>');
        k.querySelector('.ov-spark').appendChild(buildSpark(c));
        kwrap.appendChild(k);
        sparkEls.push(k.querySelector('.ov-spark'));
        kpiValueEls.push(k.querySelector('.ov-kpi-value'));
      });

      /* ---------- row 2 · live agent network ---------- */
      const netcard = el('<section class="card ov-card ov-netcard">'
        + '<div class="ov-head"><div>'
        + '<h2 class="card-title">Live agent network</h2>'
        + '<div class="sub">' + esc(D.network.meta) + '</div></div>'
        + '<div class="ov-net-tools">'
        + '<button class="toolbar-pill ov-dd-agents"><span class="ov-dda-label">All agents</span>' + icon('chevron-down', 14) + '</button>'
        + '<button class="toolbar-pill ov-dd-time"><span class="ov-ddt-label">Last 5 min</span>' + icon('chevron-down', 14) + '</button>'
        + '<button class="toolbar-pill ov-btn-expand">' + icon('arrow-up-right', 14) + 'Expand</button>'
        + '</div></div></section>');
      page.appendChild(netcard);
      const netHost = el('<div class="ov-net-host"></div>');
      netcard.appendChild(netHost);

      function filterByAgent(label) {
        OIQ.state.traceQuery = label;
        toast('Filtering traces by ' + label, 'info');
        OIQ.go('#/traces');
      }
      const mainNet = createNet(netHost, { height: 300, onNodeClick: (n) => filterByAgent(n.label) });

      const ddA = netcard.querySelector('.ov-dd-agents');
      ddA.addEventListener('click', () => {
        const cur = mainNet.getSelected();
        OIQ.ui.dropdown(ddA, [{ label: 'All agents', value: null, checked: !cur }]
          .concat(D.network.nodes.filter((n) => n.id !== 'user').map((n) => ({ label: n.label, value: n.id, checked: cur === n.id }))), (it) => {
          mainNet.setSelected(it.value);
          ddA.querySelector('.ov-dda-label').textContent = it.value ? it.label : 'All agents';
        });
      });
      const curTime = { v: 'Last 5 min' };
      const ddT = netcard.querySelector('.ov-dd-time');
      ddT.addEventListener('click', () => {
        OIQ.ui.dropdown(ddT, ['Last 5 min', 'Last 15 min', 'Last 1 h'].map((k) => ({ label: k, value: k, checked: curTime.v === k })), (it) => {
          curTime.v = it.value;
          mainNet.setTime(it.value);
          ddT.querySelector('.ov-ddt-label').textContent = it.value;
        });
      });
      netcard.querySelector('.ov-btn-expand').addEventListener('click', () => {
        const body = el('<div class="pg-overview ov-in-modal"></div>');
        const n2 = createNet(body, { height: 460, onNodeClick: (n) => { closeM(); filterByAgent(n.label); } });
        const closeM = OIQ.ui.modal({ title: 'Live agent network', wide: true, body, actions: [{ label: 'Close' }], onClose: () => { n2.destroy(); clean.modals.delete(closeM); } });
        clean.modals.add(closeM);
        requestAnimationFrame(() => n2.draw());
      });

      /* ---------- row 3 ---------- */
      const rowBot = el('<div class="ov-row-bottom"></div>');
      page.appendChild(rowBot);

      // active incidents
      const inc = el('<section class="card ov-card ov-incidents">'
        + '<div class="ov-head"><h2 class="card-title">Active incidents</h2>'
        + '<button class="pill-btn ov-viewall">' + icon('arrow-up-right', 14) + 'View all</button></div>'
        + '<div class="ov-inc-list"></div></section>');
      rowBot.appendChild(inc);
      const incList = inc.querySelector('.ov-inc-list');
      D.incidents.slice(0, 3).forEach((item) => {
        const row = el('<button class="ov-inc-row">'
          + '<span class="dot dot-' + item.dot + '"></span>'
          + '<span class="ov-inc-txt"><b>' + esc(item.title) + '</b><i>' + esc(item.where) + '</i></span>'
          + '<span class="ov-inc-age">' + esc(item.age) + '</span></button>');
        row.addEventListener('click', () => openIncident(item));
        incList.appendChild(row);
      });
      inc.querySelector('.ov-viewall').addEventListener('click', () => OIQ.go('#/incidents'));

      // cost by agent
      const cost = el('<section class="card ov-card ov-cost">'
        + '<div class="ov-head"><h2 class="card-title">Cost by agent</h2>'
        + '<button class="toolbar-pill ov-dd-cost"><span class="ov-ddc-label">30 days</span>' + icon('chevron-down', 14) + '</button></div>'
        + '<div class="ov-cost-list"></div></section>');
      rowBot.appendChild(cost);
      const costList = cost.querySelector('.ov-cost-list');
      const costFills = [], costVals = [];
      let curCostKey = '30 days';
      D.costs['30 days'].forEach((r) => {
        const row = el('<div class="ov-cost-row"><div class="ov-cost-top"><span>' + esc(r[0]) + '</span><b>' + D.fmt.money(r[1]) + '</b></div>'
          + '<div class="ov-cost-track"><div class="ov-cost-fill tone-' + r[2] + '"></div></div></div>');
        const track = row.querySelector('.ov-cost-track');
        track.addEventListener('mouseenter', (e) => showTip(costTip(r[0]), e));
        track.addEventListener('mousemove', moveTip);
        track.addEventListener('mouseleave', hideTip);
        costList.appendChild(row);
        costFills.push(row.querySelector('.ov-cost-fill'));
        costVals.push(row.querySelector('.ov-cost-top b'));
      });
      function costTip(name) {
        const rows = D.costs[curCostKey];
        const r = rows.find((x) => x[0] === name);
        const total = rows.reduce((s, x) => s + x[1], 0);
        return esc(name) + ' <b>' + D.fmt.money(r[1]) + '</b> · ' + Math.round(r[1] / total * 100) + '% of total';
      }
      function setCost(key, initial) {
        curCostKey = key;
        const rows = D.costs[key];
        const max = Math.max.apply(null, rows.map((r) => r[1]));
        rows.forEach((r, i) => {
          costVals[i].textContent = D.fmt.money(r[1]);
          const pct = (r[1] / max * 100).toFixed(1) + '%';
          if (OIQ.freeze || !initial) { costFills[i].style.width = pct; return; }
          requestAnimationFrame(() => { costFills[i].style.width = pct; });
        });
      }
      setCost('30 days', true);
      const ddC = cost.querySelector('.ov-dd-cost');
      ddC.addEventListener('click', () => {
        OIQ.ui.dropdown(ddC, ['7 days', '30 days', '90 days'].map((k) => ({ label: k, value: k, checked: curCostKey === k })), (it) => {
          setCost(it.value, false);
          ddC.querySelector('.ov-ddc-label').textContent = it.value;
        });
      });

      // welcome / ask AI
      const incId0 = D.incidents.length ? D.incidents[0].id : 'INC-2481';
      const welcome = el('<section class="card ov-card ov-welcome"><div class="ov-welcome-body">'
        + '<div class="ai-orb"></div>'
        + '<h2>Welcome back, Nizam</h2>'
        + '<div class="sub">' + D.incidents.length + ' open incidents. Want the loop explained?</div>'
        + '<div class="ov-quick">'
        + '<button class="pill-btn ov-quick-btn" data-q="Explain ' + esc(incId0) + ' and its blast radius">' + icon('doc', 14) + 'Explain ' + esc(incId0) + '</button>'
        + '<button class="pill-btn ov-quick-btn" data-q="Forecast my compute cost for the rest of this month">' + icon('dollar', 14) + 'Cost forecast</button>'
        + '<button class="pill-btn ov-quick-btn" data-q="Draft a fix for the authorization_scope handoff failure">' + icon('shield', 14) + 'Draft a fix</button>'
        + '</div>'
        + '<div class="ov-chat" hidden></div>'
        + '<div class="ov-ask">'
        + '<div class="ov-ask-top"><input class="ov-ask-input" placeholder="Ask me anything" maxlength="300">'
        + '<button class="ov-send" title="Send">' + icon('send', 17) + '</button></div>'
        + '<div class="ov-ask-bottom">'
        + '<button class="pill-btn ov-mini ov-attach">' + icon('attach', 13) + 'Attach</button>'
        + '<button class="pill-btn ov-mini ov-create">' + icon('image', 13) + 'Create</button>'
        + '<button class="ov-mic icon-btn" title="Voice input">' + icon('mic', 16) + '</button>'
        + '<span class="ov-count">0/300</span>'
        + '</div></div></div></section>');
      rowBot.appendChild(welcome);

      const chat = welcome.querySelector('.ov-chat');
      const input = welcome.querySelector('.ov-ask-input');
      const count = welcome.querySelector('.ov-count');
      let replyIdx = 0;
      function syncCount() { count.textContent = input.value.length + '/300'; }
      input.addEventListener('input', syncCount);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendAsk(); });
      welcome.querySelector('.ov-send').addEventListener('click', () => sendAsk());
      welcome.querySelectorAll('.ov-quick-btn').forEach((b) => b.addEventListener('click', () => { input.value = b.dataset.q; syncCount(); sendAsk(); }));
      welcome.querySelector('.ov-attach').addEventListener('click', () => toast('Attachments — demo placeholder', 'info'));
      welcome.querySelector('.ov-create').addEventListener('click', () => toast('Create with AI — demo placeholder', 'info'));
      welcome.querySelector('.ov-mic').addEventListener('click', () => toast('Voice input — demo placeholder', 'info'));

      function addMsg(kind, text) {
        if (chat.hidden) chat.hidden = false;
        const m = el('<div class="ov-msg ov-msg-' + kind + '"></div>');
        m.textContent = text;
        chat.appendChild(m);
        chat.scrollTop = chat.scrollHeight;
        return m;
      }
      function typewrite(text) {
        if (chat.hidden) chat.hidden = false;
        const m = el('<div class="ov-msg ov-msg-ai"><span class="ov-tw"></span><span class="ov-caret"></span></div>');
        chat.appendChild(m);
        const span = m.querySelector('.ov-tw');
        if (OIQ.freeze) { span.textContent = text; m.querySelector('.ov-caret').remove(); chat.scrollTop = chat.scrollHeight; return; }
        let i = 0;
        const iv = setInterval(() => {
          i += 2;
          span.textContent = text.slice(0, i);
          chat.scrollTop = chat.scrollHeight;
          if (i >= text.length) { clearInterval(iv); clean.intervals.delete(iv); m.querySelector('.ov-caret').remove(); }
        }, 14);
        clean.intervals.add(iv);
      }
      function sendAsk() {
        const q = input.value.trim();
        if (!q) { toast('Type a question first — or pick a shortcut above', 'warn'); return; }
        addMsg('user', q);
        input.value = '';
        syncCount();
        const pool = D.aiReplies;
        typewrite(pool[replyIdx++ % pool.length]);
      }

      /* ---------- global range sync ---------- */
      function applyRange(key) {
        H.rows.forEach((r, i) => { rowSvEls[i].textContent = fmtRowVal(r[1], key); });
        D.kpi.cards.forEach((c, i) => { kpiValueEls[i].textContent = rescaleText(c.value, key); });
        animateGauge(Math.min(100, D.rescale(H.score, key)), 700);
      }
      const offRange = OIQ.on('range', applyRange);
      clean.unbinds.add(offRange);

      /* ---------- entrance animations ---------- */
      if (OIQ.freeze) {
        sparkEls.forEach((s) => s.classList.add('drawn'));
        animateGauge(Math.min(100, D.rescale(H.score, OIQ.state.range)), 0);
      } else {
        sparkEls.forEach((s, i) => clean.timeouts.add(setTimeout(() => s.classList.add('drawn'), 200 + i * 130)));
        animateGauge(Math.min(100, D.rescale(H.score, OIQ.state.range)), 1200);
      }
    },

    unmount() { clearAll(); },
  });

  /* ============ incident detail modal ============ */
  function openIncident(item) {
    const tone = item.sev === 'critical' ? 'red' : 'amber';
    const body = el('<div class="pg-overview ov-in-modal">'
      + '<div class="ov-inc-meta">'
      + '<span class="badge badge-' + tone + '"><span class="dot dot-' + tone + '"></span>' + (item.sev === 'critical' ? 'Critical' : 'Warning') + '</span>'
      + '<span class="ov-inc-id">' + esc(item.id) + '</span>'
      + '<span class="sub">' + esc(item.where) + ' · ' + esc(item.age) + '</span>'
      + '</div>'
      + '<p class="ov-inc-desc">' + esc(item.desc) + '</p>'
      + '<div class="lbl">Timeline</div>'
      + '<div class="ov-tl">' + item.timeline.map((t, i) => '<div class="ov-tl-row"><span class="ov-tl-time">' + esc(t[0]) + '</span>'
        + '<span class="ov-tl-dot ' + tone + (i === item.timeline.length - 1 ? ' last' : '') + '"></span>'
        + '<span class="ov-tl-tx">' + esc(t[1]) + '</span></div>').join('') + '</div>'
      + '</div>');
    const close = OIQ.ui.modal({
      title: esc(item.title),
      wide: true,
      body,
      actions: [
        { label: 'View trace', kind: 'primary', onClick: () => { OIQ.go('#/trace/' + item.trace); } },
        { label: 'Close' },
      ],
      onClose: () => clean.modals.delete(close),
    });
    clean.modals.add(close);
  }
})();
