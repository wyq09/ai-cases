;/* ==== data.js ==== */
(function () {
  // seeded rng (mulberry32) — deterministic builds
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rng = mulberry32(20260913);
  const ri = (lo, hi) => Math.floor(rng() * (hi - lo + 1)) + lo;
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

  const WORKFLOWS = ['Customer Support', 'Research Pipeline', 'Lead Qualification', 'Billing Reconciliation', 'Contract Review', 'Document Ingestion', 'Data Enrichment', 'Escalation Triage'];
  const AGENTS = {
    supervisor: { name: 'Supervisor', dot: 'green' },
    router: { name: 'Router', dot: 'green' },
    knowledge: { name: 'Knowledge Agent', dot: 'green' },
    support: { name: 'Support Agent', dot: 'amber' },
    billing: { name: 'Billing Agent', dot: 'red' },
    validator: { name: 'Validator Agent', dot: 'gray' },
    response: { name: 'Response Agent', dot: 'gray' },
    research: { name: 'Research Agent', dot: 'green' },
    data: { name: 'Data Agent', dot: 'green' },
    scraping: { name: 'Scraping Agent', dot: 'green' },
    enrichment: { name: 'Enrichment Agent', dot: 'green' },
    scoring: { name: 'Scoring Agent', dot: 'amber' },
    analysis: { name: 'Analysis Agent', dot: 'green' },
    drafting: { name: 'Drafting Agent', dot: 'green' },
    compliance: { name: 'Compliance Agent', dot: 'amber' },
    escalation: { name: 'Escalation Agent', dot: 'amber' },
    indexing: { name: 'Indexing Agent', dot: 'green' },
    extraction: { name: 'Extraction Agent', dot: 'green' },
  };

  const fmt = {
    num: (n) => n.toLocaleString('en-US'),
    money: (n, dec) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: dec === undefined ? (n < 10 ? 2 : 0) : dec, maximumFractionDigits: dec === undefined ? (n < 10 ? 2 : 0) : dec }),
    ms: (n) => n >= 1000 ? (n / 1000).toFixed(2).replace(/0$/, '') + 's' : n + ' ms',
  };

  // ---- span builders -------------------------------------------------
  function span(agentKey, t0, t1, tok, kind, extra) {
    const a = AGENTS[agentKey];
    return Object.assign({
      agent: a.name, dot: a.dot, t0, t1, tok, kind: kind || 'run',
      model: pick(['GPT-5', 'GPT-5 mini', 'Claude Sonnet 4.6', 'Gemini 2.5 Pro']),
      spanId: 'sp_' + ri(10000, 39999), parentId: 'sp_' + ri(10000, 39999),
      cost: +(tok * 0.0000112).toFixed(2),
      ctxKB: +(rng() * 8 + 1.5).toFixed(1), ctxFields: ri(4, 6),
    }, extra || {});
  }

  // exact truth for tr_84921 (video)
  const T84921_SPANS = [
    span('supervisor', 0, 4.82, 1204, 'run', { spanId: 'sp_29180', ctxKB: 4.2, ctxFields: 5 }),
    span('router', 0, 0.58, 842, 'run', { spanId: 'sp_29181', parentId: 'sp_29180', ctxKB: 9.1, ctxFields: 5 }),
    span('knowledge', 0.35, 1.22, 3104, 'run'),
    span('support', 1.05, 1.82, 2441, 'run', { model: 'GPT-5 mini' }),
    span('billing', 1.95, 2.72, 2641, 'run', {
      spanId: 'sp_29184', parentId: 'sp_29180', model: 'GPT-5', ctxKB: 12.4, ctxFields: 4,
      durLabel: '0.87s', wall: '2.42s', inTok: 3241, outTok: 821, cost: 0.14,
      err: { type: 'AuthorizationContextMissing', msg: 'Required field authorization_scope was not present in the handoff context from Router Agent.' },
    }),
    span('billing', 2.78, 3.22, 600, 'retry', {
      spanId: 'sp_29185', parentId: 'sp_29180', model: 'GPT-5', ctxKB: 12.4, ctxFields: 4,
      err: { type: 'AuthorizationContextMissing', msg: 'Required field authorization_scope was not present in the handoff context from Router Agent.' },
    }),
    span('validator', 3.95, 4.24, 984, 'ghost'),
    span('response', 4.35, 4.64, 665, 'ghost'),
  ];

  // workflows -> agent chains
  const CHAINS = {
    'Customer Support': ['router', 'knowledge', 'support', 'billing', 'validator', 'response'],
    'Research Pipeline': ['router', 'research', 'analysis', 'drafting', 'validator', 'response'],
    'Lead Qualification': ['router', 'enrichment', 'scoring', 'response'],
    'Billing Reconciliation': ['router', 'data', 'billing', 'compliance', 'validator'],
    'Contract Review': ['router', 'extraction', 'knowledge', 'compliance', 'drafting', 'validator', 'response'],
    'Document Ingestion': ['router', 'extraction', 'indexing', 'validator'],
    'Data Enrichment': ['router', 'scraping', 'enrichment', 'data', 'response'],
    'Escalation Triage': ['router', 'knowledge', 'escalation', 'response'],
  };

  function makeErr() {
    const errs = [
      { type: 'AuthorizationContextMissing', msg: 'Required field authorization_scope was not present in the handoff context from Router Agent.' },
      { type: 'ToolTimeout', msg: 'Tool call billing.lookup_account exceeded 30s budget after 2 attempts.' },
      { type: 'ContextOverflow', msg: 'Handoff context exceeded 32k token limit; conversation_history could not be truncated safely.' },
      { type: 'SchemaValidation', msg: 'Response failed schema validation: expected object, got null at $.refund_amount.' },
      { type: 'UpstreamRateLimit', msg: 'Model provider returned 429; retry budget exhausted.' },
    ];
    return pick(errs);
  }

  function buildSpans(t) {
    if (t.id === 'tr_84921') return T84921_SPANS;
    const chain = CHAINS[t.workflow] || CHAINS['Customer Support'];
    const D = t.dur;
    const spans = [span('supervisor', 0, D, Math.round(t.tokens * 0.1))];
    let cursor = 0.05 + rng() * 0.1;
    const failIdx = t.status === 'Failed' ? Math.min(chain.length - 2, 1 + Math.floor(rng() * (chain.length - 2))) : -1;
    const usable = chain.filter((k) => !(t.status === 'Failed' && (k === 'validator' || k === 'response')));
    usable.forEach((k, i) => {
      const frac = (0.75 / usable.length) * (0.7 + rng() * 0.7);
      const len = Math.max(0.18, D * frac * 0.55);
      const s = span(k, cursor, Math.min(D - 0.05, cursor + len), Math.round(t.tokens * (0.28 / usable.length) * (0.7 + rng() * 0.8)));
      if (i === failIdx) {
        s.dot = 'red';
        s.err = makeErr();
        spans.push(s);
        const r = span(k, s.t1 + 0.06, Math.min(D - 0.02, s.t1 + 0.44), Math.round(s.tok * 0.3), 'retry', { err: s.err, model: s.model, ctxKB: s.ctxKB, ctxFields: s.ctxFields });
        r.spanId = 'sp_' + (parseInt(s.spanId.slice(3)) + 1);
        r.dot = 'red';
        cursor = r.t1 + 0.02;
        spans.push(r);
        return;
      }
      cursor = s.t1 + 0.03 + rng() * 0.08;
      spans.push(s);
    });
    if (t.status === 'Failed') {
      const rest = Math.max(0.3, D - cursor);
      let g = cursor + rest * 0.3;
      if (chain.includes('validator')) { spans.push(span('validator', g, g + rest * 0.18, ri(400, 1100), 'ghost')); g += rest * 0.24; }
      if (chain.includes('response')) spans.push(span('response', g, g + rest * 0.18, ri(300, 800), 'ghost'));
    }
    return spans;
  }

  // ---- trace table truth (video) --------------------------------------
  // [id, workflow, startedClock, durText, agents, tokens, cost, status]
  const TABLE = [
    ['tr_84921', 'Customer Support', '09:42:18', '4.82s', 8, 12481, 0.42, 'Failed'],
    ['tr_84922', 'Research Pipeline', '09:42:11', '2.14s', 5, 6204, 0.18, 'Success'],
    ['tr_84923', 'Customer Support', '09:41:58', '6.10s', 8, 18902, 0.61, 'Failed'],
    ['tr_84924', 'Lead Qualification', '09:41:44', '1.82s', 5, 4118, 0.12, 'Success'],
    ['tr_84925', 'Billing Reconciliation', '09:41:30', '5.44s', 7, 14206, 0.48, 'Failed'],
    ['tr_84926', 'Customer Support', '09:41:12', '3.28s', 8, 11044, 0.36, 'Success'],
    ['tr_84927', 'Contract Review', '09:40:56', '7.92s', 9, 22318, 0.74, 'Failed'],
    ['tr_84928', 'Document Ingestion', '09:40:41', '2.46s', 6, 7660, 0.21, 'Success'],
    ['tr_84929', 'Customer Support', '09:40:22', '4.02s', 8, 12004, 0.39, 'Failed'],
    ['tr_84930', 'Data Enrichment', '09:40:08', '2.91s', 5, 8142, 0.24, 'Success'],
    ['tr_84931', 'Escalation Triage', '09:39:54', '3.61s', 6, 9880, 0.31, 'Success'],
    ['tr_84932', 'Research Pipeline', '09:39:38', '8.44s', 12, 28412, 0.92, 'Failed'],
  ];
  const RECENT_EXTRA = {
    tr_84918: ['tr_84918', 'Customer Support', '09:38:04', '4.31s', 8, 12188, 0.41, 'Failed'],
    tr_84911: ['tr_84911', 'Customer Support', '09:31:27', '3.02s', 8, 9412, 0.29, 'Success'],
  };

  function clockToSec(c) { const [h, m, s] = c.split(':').map(Number); return h * 3600 + m * 60 + s; }
  function secToClock(s) { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`; }

  function mkTrace(row) {
    const [id, workflow, startedClock, durText, agents, tokens, cost, status] = row;
    const dur = parseFloat(durText);
    const exact = id === 'tr_84921';
    const t = {
      id, workflow, env: 'Production', framework: 'LangGraph',
      startedClock, started: startedClock + (exact ? '.421' : '.' + ri(100, 999)),
      dur, durText, agents, tokens, cost, status,
      tokensIn: exact ? 9410 : Math.round(tokens * 0.754),
      tokensOut: exact ? 3071 : tokens - Math.round(tokens * 0.754),
      retries: status === 'Failed' ? (exact ? 2 : ri(1, 2)) : 0,
      costX: exact ? '3.2' : (status === 'Failed' ? (2.1 + rng() * 2).toFixed(1) : (0.7 + rng() * 0.6).toFixed(1)),
      rootAgent: null, rootCause: null, errType: null, errMsg: null,
      p95: exact ? '3.1s' : (dur * (0.55 + rng() * 0.3)).toFixed(1) + 's',
    };
    t.spans = buildSpans(t);
    const runSpans = t.spans.filter((s) => s.kind !== 'ghost');
    const failSpan = runSpans.find((s) => s.err);
    if (status === 'Failed' && failSpan) {
      t.rootAgent = failSpan.agent; t.errType = failSpan.err.type; t.errMsg = failSpan.err.msg;
      t.rootCause = failSpan.err.type === 'AuthorizationContextMissing' ? 'Context loss' : (failSpan.err.type === 'ToolTimeout' ? 'Timeout' : failSpan.err.type === 'SchemaValidation' ? 'Validation' : 'Tool failure');
      t.rootNote = failSpan.err.type === 'AuthorizationContextMissing' ? 'authorization_scope' : failSpan.err.type;
      t.failedInvocation = runSpans.indexOf(failSpan) + 1;
      t.failedOfTotal = runSpans.length;
    }
    t.contextFlow = buildContextFlow(t);
    return t;
  }

  function buildContextFlow(t) {
    const chain = (CHAINS[t.workflow] || CHAINS['Customer Support']).slice(0, 3);
    const names = chain.map((k) => AGENTS[k].name.replace(' Agent', ''));
    const flows = [];
    let kb = +(2 + rng() * 3).toFixed(1);
    names.forEach((n, i) => {
      const bad = t.status === 'Failed' && i === names.length - 1 && t.errType === 'AuthorizationContextMissing';
      if (i > 0) kb = +(kb * (1.8 + rng() * 0.6)).toFixed(1);
      flows.push({ name: n, fields: bad ? 4 : ri(5, 6), kb, bad });
    });
    return flows;
  }

  // 42 traces total: video 12 + 2 extra + generated
  const traces = TABLE.map(mkTrace);
  Object.values(RECENT_EXTRA).forEach((r) => traces.push(mkTrace(r)));
  for (let i = 0; traces.length < 42; i++) {
    const n = 84910 - i;
    const failed = rng() < 0.42;
    const wf = pick(WORKFLOWS);
    const dur = +(0.9 + rng() * 8).toFixed(2);
    const tokens = ri(2600, 30000);
    traces.push(mkTrace([`tr_${n}`, wf, secToClock(clockToSec('09:39:38') - Math.floor(rng() * 1800)), dur + 's', ri(5, 12), tokens, +(tokens * 0.0000337).toFixed(2), failed ? 'Failed' : 'Success']));
  }
  const traceById = Object.fromEntries(traces.map((t) => [t.id, t]));
  function getTrace(id) {
    if (traceById[id]) return traceById[id];
    const num = parseInt(String(id).replace(/\D/g, '')) || 84999;
    const failed = num % 3 === 0;
    const tk = 3000 + ((num * 137) % 24000);
    const t = mkTrace([id, WORKFLOWS[num % WORKFLOWS.length], secToClock(Math.max(8 * 3600, 34000 - (84999 - num) * 20)), (1 + (num % 70) / 10).toFixed(2) + 's', 5 + (num % 6), tk, +(tk * 0.0000337).toFixed(2), failed ? 'Failed' : 'Success']);
    traceById[id] = t;
    traces.unshift(t);
    return t;
  }

  // handoff deep-dive (Router -> Billing, video truth)
  const handoff = {
    id: 'router-billing', from: 'Router Agent', to: 'Billing Agent',
    title: 'Router Agent → Billing Agent', status: 'Context degraded',
    traceId: 'tr_84921', at: '09:42:18.421', workflow: 'Customer Support',
    path: { ctxKB: 12.4, latencyMs: 420, tokens: 2431, fields: '4 of 5', fromScope: 'admin', toScope: 'user' },
    fields: [
      { f: 'customer_id', sent: ['present', true], exp: ['required', true], status: 'Match' },
      { f: 'intent', sent: ['present', true], exp: ['required', true], status: 'Match' },
      { f: 'order_id', sent: ['present', true], exp: ['required', true], status: 'Match' },
      { f: 'authorization_scope', sent: ['not sent', false], exp: ['required', true], status: 'Missing', bad: true },
      { f: 'conversation_history', sent: ['present', true], exp: ['optional', true], status: 'Match' },
      { f: 'session_metadata', sent: ['present', true], exp: ['not used', false], status: 'Unused', unused: true },
    ],
    samples: {
      customer_id: 'cust_88412 · "Acme Robotics Inc" (tier: enterprise)',
      intent: 'refund_request · confidence 0.94',
      order_id: 'ord_55621 · placed 09:12:04 UTC',
      authorization_scope: '— never attached by Router. Caller scope was admin.',
      conversation_history: '14 messages · 9.1 KB · duplicated in 4 agents',
      session_metadata: 'channel: web · locale: en-US · csat pending',
    },
    payloadKB: 12.4, payloadX: '3.2× workflow baseline',
    bloat: 'Context bloat detected — conversation_history is duplicated across 4 agents in this workflow.',
    dropNote: 'authorization_scope was dropped in the Router → Billing contract. Billing rejected the request and triggered two retries.',
    blast: { affected: 128, failureRate: '17.8%', wasted: '$184', blocked: 2 },
    analysis: 'The Router Agent constructs the Billing handoff from a template that predates the authorization model. It passes conversation state but never forwards the caller scope, so Billing evaluates the request as an anonymous user.',
    fix: {
      title: 'Recommended fix', body: 'Add authorization_scope to the Router → Billing handoff contract and validate it before invocation. Projected: −17.8% edge failure rate, −$184/mo wasted compute.',
      diff: [
        { k: '+ context.authorization_scope', note: 'forward caller scope from session', add: true },
        { k: '+ validate_handoff_contract(billing_v2)', note: 'reject before invocation, not after', add: true },
        { k: '− template billing_handoff_v1 (legacy)', note: 'predates authorization model', add: false },
      ],
    },
    elsewhere: [
      { edge: 'Supervisor → Payments', note: 'auth_scope missing · 42 runs' },
      { edge: 'Router → Escalation', note: 'session_id missing · 18 runs' },
    ],
    recent: [
      { id: 'tr_84921', st: 'Rejected — auth_scope missing', bad: true, kb: '12.4 KB', ms: '420 ms', at: '09:42' },
      { id: 'tr_84918', st: 'Rejected — auth_scope missing', bad: true, kb: '12.1 KB', ms: '404 ms', at: '09:38' },
      { id: 'tr_84911', st: 'Completed', bad: false, kb: '8.8 KB', ms: '362 ms', at: '09:31' },
    ],
  };

  const incidents = [
    {
      id: 'INC-2481', title: 'Infinite delegation loop', sev: 'critical', dot: 'red',
      where: 'Customer Support · 842 runs affected', age: '4m 18s',
      desc: 'Supervisor keeps delegating refund intents back to Support Agent after a failed Billing handoff. Each loop burns ~2.4k tokens; 842 runs affected in the last 40 minutes.',
      timeline: [['09:38', 'First loop detected in run tr_84902'], ['09:40', 'Rate of loops exceeds 20/min'], ['09:42', 'Auto-mitigation armed — awaiting approval']],
      trace: 'tr_84921',
    },
    {
      id: 'INC-2480', title: 'Authorization context dropped', sev: 'critical', dot: 'red',
      where: 'Billing Agent · 128 runs affected', age: '12m',
      desc: 'Router → Billing handoff omits authorization_scope, so Billing rejects every request as anonymous. Root cause identified in the handoff inspector; fix drafted.',
      timeline: [['09:30', 'Failure rate on edge crosses 15%'], ['09:36', 'Pattern matched in 128 runs'], ['09:40', 'Recommended fix generated']],
      trace: 'tr_84921',
    },
    {
      id: 'INC-2479', title: 'Research Agent latency +38%', sev: 'warning', dot: 'amber',
      where: 'Research Pipeline · degraded', age: '31m',
      desc: 'p95 latency on Research Agent rose from 2.1s to 2.9s after the upstream provider switched capacity regions.',
      timeline: [['09:11', 'Latency alert threshold crossed'], ['09:15', 'Provider status page confirms region failover']],
      trace: 'tr_84932',
    },
  ];

  const network = {
    legend: [['Healthy', 'green'], ['Degraded', 'amber'], ['Failing', 'red'], ['Idle', 'gray']],
    nodes: [
      { id: 'user', label: 'User request', sub: '18.4K req / hr', icon: 'person', ic: 'blue', x: 7, y: 50, health: 'green' },
      { id: 'supervisor', label: 'Supervisor', sub: '1,842 calls · 99.4%', icon: 'robot', ic: 'green', x: 32, y: 50, health: 'green' },
      { id: 'research', label: 'Research agent', sub: '842 calls · 98.9%', icon: 'robot', ic: 'green', x: 58, y: 18, health: 'green' },
      { id: 'data', label: 'Data agent', sub: '1,204 calls · 99.2%', icon: 'robot', ic: 'green', x: 58, y: 50, health: 'green' },
      { id: 'validation', label: 'Validation agent', sub: '980 calls · 82.1%', icon: 'robot', ic: 'amber', x: 58, y: 82, health: 'amber', degraded: true },
      { id: 'final', label: 'Final agent', sub: '1,780 calls · 99.8%', icon: 'robot', ic: 'green', x: 87, y: 50, health: 'green' },
    ],
    edges: [
      ['user', 'supervisor', 'gray'], ['supervisor', 'research', 'gray'], ['supervisor', 'data', 'blue'],
      ['supervisor', 'validation', 'amber'], ['research', 'final', 'gray'], ['data', 'final', 'gray'], ['validation', 'final', 'gray'],
    ],
    meta: '42 workflows · 186 agents · 1 degraded node · updating in real time',
  };

  const costs = {
    '30 days': [['Supervisor', 2421, 'purple'], ['Research', 1842, 'green'], ['Support', 1421, 'blue'], ['Billing', 984, 'amber']],
    '7 days': [['Supervisor', 568, 'purple'], ['Research', 431, 'green'], ['Support', 322, 'blue'], ['Billing', 262, 'amber']],
    '90 days': [['Supervisor', 7120, 'purple'], ['Research', 5390, 'green'], ['Support', 4402, 'blue'], ['Billing', 2718, 'amber']],
  };

  const kpi = {
    health: { score: 94, delta: '+2 this week', rows: [['Success rate', '96.4%'], ['Avg latency', '2.8s'], ['Active workflows', '42'], ['Active agents', '186'], ['Open incidents', 3]] },
    cards: [
      { label: 'Workflow success', value: '96.4%', delta: '-1.2%', deltaTone: 'red', suffix: 'this week', icon: 'check', ic: 'green', line: [22, 30, 26, 40, 38, 55, 62, 78, 92], tone: 'red' },
      { label: 'Active agents', value: '186', delta: '+12', deltaTone: 'purple', suffix: 'vs last week', icon: 'robot', ic: 'purple', line: [30, 38, 44, 42, 55, 60, 72, 80, 88], tone: 'purple' },
      { label: 'Failed runs', value: '248', delta: '-18%', deltaTone: 'green', suffix: 'this week', icon: 'warning', ic: 'amber', line: [78, 70, 74, 58, 52, 44, 38, 26, 12], tone: 'green' },
      { label: 'Compute cost', value: '$8,421', delta: '+6.8%', deltaTone: 'red', suffix: 'this week', icon: 'dollar', ic: 'blue', line: [55, 48, 52, 44, 40, 34, 30, 22, 10], tone: 'red' },
    ],
  };

  const me = { team: 'Platform Team', role: 'Owner · acme-ai' };

  const aiReplies = [
    'INC-2481 is a delegation loop: after the Billing handoff fails, the Supervisor re-queues the same refund intent instead of escalating. Short-term: enable the loop breaker (max 3 delegations). Root fix: apply the Router → Billing contract patch so the first attempt succeeds.',
    'Cost forecast: at the current burn rate you will land at ~$8.9k this month (+5.6%). Biggest lever is conversation_history duplication — deduplicating it across agents saves ~$310/mo.',
    'Draft ready: validate authorization_scope in the Router → Billing handoff contract before invocation, with a unit test per scope role. Projected impact: −17.8% edge failures, −$184/mo.',
  ];

  const notifs = incidents.map((i) => ({ icon: i.sev === 'critical' ? 'warning' : 'clock', tone: i.sev === 'critical' ? 'red' : 'amber', title: i.title, sub: `${i.id} · ${i.where} · ${i.age}`, go: '#/incidents' }));

  function rescale(v, rangeKey) {
    const f = { '15 min': 0.42, '30 min': 1, '1 h': 1.85, '24 h': 12.4 }[rangeKey] || 1;
    return typeof v === 'number' ? Math.round(v * f) : v;
  }

  window.OIQ_DATA = { traces, getTrace, traceById, makeTrace: mkTrace, handoff, incidents, network, costs, kpi, me, workflows: WORKFLOWS, agents: AGENTS, aiReplies, notifs, rescale, fmt };
})();
