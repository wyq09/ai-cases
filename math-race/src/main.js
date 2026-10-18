'use strict';

/* 路由 + SSE 生命周期 + 房间视图切换 */

const app = $('#app');
let roomCtl = null;   // 当前房间视图 { update, destroy, kind }
let liveES = null;    // EventSource
let livePoll = 0;     // 轮询兜底定时器
let liveSeq = 0;      // 连接代次，防止旧连接回调串场

function stopLive() {
  liveSeq++;
  if (liveES) { try { liveES.close(); } catch {} liveES = null; }
  if (livePoll) { clearInterval(livePoll); livePoll = 0; }
}

/**
 * 建立房间实况连接：SSE 优先，连续失败自动降级为 2s 轮询。
 * token 为空串即观战（大屏）。
 */
function connectLive(code, token, handlers) {
  stopLive();
  const seq = liveSeq;
  const url = `${API}/api/rooms/${code}/events${token ? `?token=${token}` : ''}`;
  let fails = 0;

  const startPolling = () => {
    if (livePoll || seq !== liveSeq) return;
    livePoll = setInterval(async () => {
      if (seq !== liveSeq) return;
      const r = await api(`/api/rooms/${code}/state${token ? `?token=${token}` : ''}`);
      if (seq !== liveSeq) return;
      if (r.status === 404) { stopLive(); handlers.gone && handlers.gone(); return; }
      if (r.ok) handlers.onState(r.data);
    }, 2000);
  };

  try {
    const es = new EventSource(url);
    liveES = es;
    es.addEventListener('state', (e) => {
      fails = 0;
      if (livePoll) { clearInterval(livePoll); livePoll = 0; }
      if (seq === liveSeq) handlers.onState(JSON.parse(e.data));
    });
    es.addEventListener('kicked', () => { if (seq === liveSeq) handlers.onKicked && handlers.onKicked(); });
    es.addEventListener('closed', () => { if (seq === liveSeq) handlers.onClosed && handlers.onClosed(); });
    es.onerror = () => {
      fails++;
      if (fails >= 3) startPolling();
    };
  } catch {
    startPolling();
  }
}

/* ---------- 房间（选手视角） ---------- */

async function openRoom(code) {
  const sess = store.get(code);
  if (!sess) { location.hash = ''; renderHome(code); return; }

  const r = await api(`/api/rooms/${code}/state?token=${sess.token}`);
  if (!r.ok) {
    store.del(code);
    toast(r.data.error || '房间不存在或已解散');
    location.hash = '';
    route();
    return;
  }
  calibrate(r.data);
  const ctx = { code, sess, state: r.data };
  let kind = '';

  function refresh() {
    api(`/api/rooms/${code}/state?token=${sess.token}`).then((x) => {
      if (x.ok) { ctx.state = x.data; syncView(); }
    });
  }

  function switchTo(want) {
    if (roomCtl && roomCtl.destroy) roomCtl.destroy();
    app.innerHTML = '';
    if (want === 'lobby') roomCtl = mountLobby(app, ctx);
    else if (want === 'race') roomCtl = mountRace(app, ctx);
    else roomCtl = mountResult(app, ctx);
  }

  function syncView() {
    const st = ctx.state;
    const want = st.status === 'lobby' ? 'lobby' : st.status === 'racing' ? 'race' : 'result';
    if (want === kind) { roomCtl.update(st); return; }
    kind = want;
    switchTo(want);
  }

  connectLive(code, sess.token, {
    onState: (st) => { calibrate(st); ctx.state = st; syncView(); },
    onKicked: () => { store.del(code); roomCtl = null; stopLive(); mountEndScreen(app, '你已被移出房间', '可以重新扫码输入房间号再加入'); },
    onClosed: () => { store.del(code); roomCtl = null; stopLive(); mountEndScreen(app, '房间已解散', '房主退出了房间'); },
    gone: () => { store.del(code); roomCtl = null; mountEndScreen(app, '房间已结束', '本局比赛已归档'); },
  });

  app.innerHTML = '';
  syncView();
}

async function leaveRoom(code) {
  const sess = store.get(code);
  if (sess) await api(`/api/rooms/${code}/leave`, { token: sess.token });
  store.del(code);
  location.hash = '';
  route();
}

/* ---------- 大屏（观战视角） ---------- */

async function openBig(code) {
  const r = await api(`/api/rooms/${code}/state`);
  if (!r.ok) {
    mountEndScreen(app, '房间不存在', '房主可能还没创建，或房间已解散');
    return;
  }
  calibrate(r.data);
  const ctx = { code, state: r.data };
  connectLive(code, '', {
    onState: (st) => { calibrate(st); ctx.state = st; if (roomCtl) roomCtl.update(st); },
    onClosed: () => { roomCtl = null; stopLive(); mountEndScreen(app, '房间已解散', '房主退出了房间'); },
    gone: () => { roomCtl = null; mountEndScreen(app, '房间已结束', '本局比赛已归档'); },
  });
  app.innerHTML = '';
  roomCtl = mountBig(app, ctx);
}

/* ---------- 路由 ---------- */

function route() {
  stopLive();
  if (roomCtl && roomCtl.destroy) roomCtl.destroy();
  roomCtl = null;
  app.innerHTML = '';

  const prefill = (new URLSearchParams(location.search).get('code') || '').replace(/\D/g, '').slice(0, 8);
  let m = location.hash.match(/^#\/room\/(\d{8})$/);
  if (m) { openRoom(m[1]); return; }
  m = location.hash.match(/^#\/big\/(\d{8})$/);
  if (m) { openBig(m[1]); return; }
  mountHome(app, prefill);
}

window.addEventListener('hashchange', route);
route();
