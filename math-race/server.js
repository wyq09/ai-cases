#!/usr/bin/env node
'use strict';

/**
 * math-race 服务端 · 零依赖单进程
 *
 * - node:http 托管静态页 + REST + SSE；node:sqlite 持久化（每房间一行 JSON）
 * - 全部路由挂在 BASE_PATH（默认 /math-race）下，反代原样透传路径即可
 * - 房间状态常驻内存，变更防抖写盘；重启后按房间号从 SQLite 恢复
 *
 * 启动：node server.js   （PORT=8787 BASE_PATH=/math-race DB_PATH=data/rooms.db）
 */

const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { genQuestion, COUNTS } = require('./questions.js');

const PORT = Number(process.env.PORT || 8787);
const _baseRaw = (process.env.BASE_PATH || '/math-race').trim();
const BASE = _baseRaw === '/' ? '' : '/' + _baseRaw.split('/').filter(Boolean).join('/');
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'rooms.db');

const MAX_ROOMS = Number(process.env.MAX_ROOMS || 200);
const MAX_PLAYERS = 32;
const DEFAULT_DURATION = 180;
const ROOM_TTL = 6 * 3600e3;        // 无人大厅存活上限
const FINISHED_TTL = 30 * 60e3;     // 结束房间保留时长
const ANSWER_COOLDOWN = 250;        // 提交最小间隔 ms
const PUSH_COALESCE = 120;          // SSE 广播合并窗口 ms

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('CREATE TABLE IF NOT EXISTS rooms(code TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)');
const stmtGet = db.prepare('SELECT data FROM rooms WHERE code = ?');
const stmtPut = db.prepare('INSERT INTO rooms(code, data, updated_at) VALUES(?, ?, ?) ON CONFLICT(code) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at');
const stmtDel = db.prepare('DELETE FROM rooms WHERE code = ?');

// ---------------------------------------------------------------- 房间存储

const rooms = new Map();   // code -> room
const dirty = new Set();

function loadRoom(code) {
  if (rooms.has(code)) return rooms.get(code);
  const row = stmtGet.get(code);
  if (!row) return null;
  let room;
  try { room = JSON.parse(row.data); } catch { return null; }
  if (!room || room.code !== code || !Array.isArray(room.players)) return null;
  rooms.set(code, room);
  return room;
}

function markDirty(code) { dirty.add(code); }

function flush() {
  if (!dirty.size) return;
  const now = Date.now();
  for (const code of dirty) {
    const room = rooms.get(code);
    if (room) stmtPut.run(code, JSON.stringify(room), now);
    else stmtDel.run(code);
  }
  dirty.clear();
}
setInterval(flush, 500).unref();

function dropRoom(code) {
  rooms.delete(code);
  dirty.delete(code);
  stmtDel.run(code); // 立即删行，防止防抖落盘前被 loadRoom 从库里复活
  const m = conns.get(code);
  if (m) {
    for (const set of m.values()) {
      for (const res of set) { try { res.end(); } catch {} }
    }
    conns.delete(code);
  }
}

// ---------------------------------------------------------------- 领域逻辑

const newToken = () => crypto.randomBytes(16).toString('hex');
const newPid = () => 'p' + crypto.randomBytes(3).toString('hex');
const newSeed = () => (Math.random() * 0xffffffff) >>> 0;

function newCode() {
  let code;
  do { code = String(10000000 + Math.floor(Math.random() * 90000000)); }
  while (rooms.has(code) || stmtGet.get(code));
  return code;
}

function newPlayer(nickname, grade) {
  return {
    pid: newPid(), token: newToken(),
    nickname, grade,
    idx: 0, correct: 0, wrong: 0,
    wrongList: [],            // 错题：{ text, mine, right }
    joinedAt: Date.now(),
    finishedAt: 0, lastAnswerAt: 0, lastSeen: 0,
    online: false,
  };
}

const totalOf = (p) => COUNTS[p.grade] || COUNTS[1];
const questionOf = (room, p, idx) => genQuestion(p.grade, `${room.seed}:${p.token}:${idx}`);

function publicState(room, token) {
  const now = Date.now();
  const me = token ? room.players.find((p) => p.token === token && !p.kicked) : null;
  const state = {
    code: room.code,
    status: room.status,                       // lobby | racing | finished
    theme: room.theme,                         // track | dragon
    durationSec: room.durationSec,
    startAt: room.startAt || 0,
    endAt: room.endAt || 0,
    ownerPid: room.ownerPid,
    players: room.players.filter((p) => !p.kicked).map((p) => ({
      pid: p.pid, nickname: p.nickname, grade: p.grade,
      progress: p.correct, total: totalOf(p),
      wrong: p.wrong, finished: !!p.finishedAt, finishedAt: p.finishedAt || 0,
      online: !!p.online,
    })),
    ranks: room.ranks || [],
    serverNow: now,
    meta: { counts: COUNTS },
  };
  if (me) {
    state.you = { pid: me.pid, idx: me.idx, finished: !!me.finishedAt, wrongList: me.wrongList };
    if (room.status === 'racing' && !me.finishedAt) {
      const q = questionOf(room, me, me.idx);
      state.you.question = { idx: me.idx, text: q.text };
    }
  }
  return state;
}

function computeRanks(room) {
  const list = room.players.filter((p) => !p.kicked);
  list.sort((a, b) => {
    if (a.finishedAt && b.finishedAt) return a.finishedAt - b.finishedAt;
    if (a.finishedAt) return -1;
    if (b.finishedAt) return 1;
    // 各年级题量不同，按完成比例比较，避免低年级因题多而虚高
    const ra = a.correct / totalOf(a);
    const rb = b.correct / totalOf(b);
    return (rb - ra) || (a.joinedAt - b.joinedAt);
  });
  room.ranks = list.map((p) => p.pid);
}

function finishRace(room) {
  if (room.status !== 'racing') return;
  room.status = 'finished';
  room.endAt = Math.min(room.endAt || Date.now(), Date.now());
  computeRanks(room);
  markDirty(room.code);
  console.log(`[math-race] room ${room.code} finished (${room.players.length} players)`);
  broadcast(room.code);
}

function maybeFinishRace(room) {
  const alive = room.players.filter((p) => !p.kicked);
  if (alive.length && alive.every((p) => p.finishedAt)) finishRace(room);
}

// ---------------------------------------------------------------- SSE

// code -> Map(token -> Set<res>)，token 为空串表示观战（大屏）
const conns = new Map();
const pendingPush = new Map();

function broadcast(code) {
  if (pendingPush.has(code)) return;
  pendingPush.set(code, setTimeout(() => {
    pendingPush.delete(code);
    pushNow(code);
  }, PUSH_COALESCE));
}

function pushNow(code) {
  const room = rooms.get(code);
  const m = conns.get(code);
  if (!room || !m) return;
  for (const [token, set] of m) {
    const payload = JSON.stringify(publicState(room, token));
    for (const res of set) {
      try { res.write(`event: state\ndata: ${payload}\n\n`); } catch {}
    }
  }
}

function pushEvent(code, token, event, data) {
  const m = conns.get(code);
  if (!m) return;
  const set = m.get(token);
  if (!set) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data || {})}\n\n`;
  for (const res of set) { try { res.write(payload); } catch {} }
}

setInterval(() => {
  for (const m of conns.values()) {
    for (const set of m.values()) {
      for (const res of set) { try { res.write(': ping\n\n'); } catch {} }
    }
  }
}, 15000).unref();

function handleEvents(req, res, code, token) {
  const room = loadRoom(code);
  if (!room) return notFound(res, '房间不存在或已解散');
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.write('retry: 2500\n\n');
  let m = conns.get(code);
  if (!m) { m = new Map(); conns.set(code, m); }
  let set = m.get(token);
  if (!set) { set = new Set(); m.set(token, set); }
  set.add(res);
  const p = room.players.find((x) => x.token === token && !x.kicked);
  if (p && !p.online) {
    p.online = true;
    p.lastSeen = Date.now();
    markDirty(code);
    broadcast(code);
  }
  res.write(`event: state\ndata: ${JSON.stringify(publicState(room, token))}\n\n`);
  req.on('close', () => {
    set.delete(res);
    if (!set.size) m.delete(token);
    if (!m.size) conns.delete(code);
    const rp = rooms.get(code);
    const player = rp && rp.players.find((x) => x.token === token);
    if (player && player.online) {
      player.online = false;
      markDirty(code);
      broadcast(code);
    }
  });
}

// ---------------------------------------------------------------- 请求处理

function cleanNick(s) {
  const t = String(s || '').replace(/[\u200b-\u200f\uFEFF]/g, '').trim().slice(0, 12);
  return t || '小选手';
}

function clampGrade(g) {
  const n = Number(g);
  return n >= 1 && n <= 4 ? Math.floor(n) : 1;
}

function handleCreate(body) {
  if (rooms.size >= MAX_ROOMS) return err(503, '房间数已达上限，请稍后再试');
  const theme = body.theme === 'dragon' ? 'dragon' : 'track';
  const duration = Number(body.durationSec);
  const room = {
    code: newCode(),
    seed: newSeed(),
    status: 'lobby',
    theme,
    durationSec: Number.isFinite(duration) ? Math.min(600, Math.max(60, Math.round(duration))) : DEFAULT_DURATION,
    createdAt: Date.now(), updatedAt: Date.now(),
    startAt: 0, endAt: 0, ranks: [],
    ownerPid: null,
    players: [],
  };
  const p = newPlayer(cleanNick(body.nickname), clampGrade(body.grade));
  room.ownerPid = p.pid;
  room.players.push(p);
  rooms.set(room.code, room);
  markDirty(room.code);
  console.log(`[math-race] room ${room.code} created by ${p.nickname}(G${p.grade})`);
  return { code: room.code, token: p.token, pid: p.pid, state: publicState(room, p.token) };
}

function handleJoin(room, body) {
  if (room.players.filter((p) => !p.kicked).length >= MAX_PLAYERS) return err(409, '房间已满（最多 32 人）');
  if (room.status !== 'lobby') return err(409, '比赛已开始，无法加入');
  const p = newPlayer(cleanNick(body.nickname), clampGrade(body.grade));
  room.players.push(p);
  room.updatedAt = Date.now();
  markDirty(room.code);
  broadcast(room.code);
  return { token: p.token, pid: p.pid, state: publicState(room, p.token) };
}

function handleMe(room, token, body) {
  const p = room.players.find((x) => x.token === token && !x.kicked);
  if (!p) return err(404, '不在房间中');
  if (room.status !== 'lobby') return err(409, '比赛进行中，不能修改');
  if (body.nickname !== undefined) p.nickname = cleanNick(body.nickname);
  if (body.grade !== undefined) p.grade = clampGrade(body.grade);
  room.updatedAt = Date.now();
  markDirty(room.code);
  broadcast(room.code);
  return { ok: true, state: publicState(room, token) };
}

function handleSettings(room, token, body) {
  const p = room.players.find((x) => x.token === token && !x.kicked);
  if (!p || p.pid !== room.ownerPid) return err(403, '只有房主可以修改设置');
  if (room.status !== 'lobby') return err(409, '比赛进行中，不能修改');
  if (body.theme === 'track' || body.theme === 'dragon') room.theme = body.theme;
  if (body.durationSec !== undefined) {
    const d = Number(body.durationSec);
    if (Number.isFinite(d)) room.durationSec = Math.min(600, Math.max(60, Math.round(d)));
  }
  room.updatedAt = Date.now();
  markDirty(room.code);
  broadcast(room.code);
  return { ok: true, state: publicState(room, token) };
}

function handleStart(room, token) {
  const p = room.players.find((x) => x.token === token && !x.kicked);
  if (!p || p.pid !== room.ownerPid) return err(403, '只有房主可以开始比赛');
  if (room.status !== 'lobby') return err(409, '比赛已开始');
  if (room.players.filter((x) => !x.kicked).length < 1) return err(409, '房间没有选手');
  room.status = 'racing';
  room.startAt = Date.now() + 3200;                 // 3-2-1 倒计时
  room.endAt = room.startAt + room.durationSec * 1000;
  room.updatedAt = Date.now();
  markDirty(room.code);
  console.log(`[math-race] room ${room.code} started (${room.durationSec}s, ${room.players.length} players)`);
  broadcast(room.code);
  return { ok: true };
}

function handleAnswer(room, token, body) {
  const p = room.players.find((x) => x.token === token && !x.kicked);
  if (!p) return err(404, '不在房间中');
  if (room.status !== 'racing') return err(409, '比赛未在进行中');
  const now = Date.now();
  if (room.endAt && now > room.endAt) { finishRace(room); return err(409, '比赛已结束'); }
  if (p.finishedAt) return err(409, '你已完赛');
  if (now < room.startAt) return err(409, '比赛尚未开始');
  const idx = Number(body.idx);
  if (!Number.isInteger(idx) || idx !== p.idx) return err(409, '题目序号不匹配');
  if (now - p.lastAnswerAt < ANSWER_COOLDOWN) return err(429, '答得太快啦，歇一下');
  p.lastAnswerAt = now;

  const q = questionOf(room, p, idx);
  const mine = Math.trunc(Number(body.answer));
  const correct = Number.isFinite(mine) && mine === q.answer;
  if (correct) {
    p.correct += 1;
  } else {
    p.wrong += 1;
    p.wrongList.push({ text: q.text, mine: Number.isFinite(mine) ? mine : null, right: q.answer });
    if (p.wrongList.length > 60) p.wrongList.shift();
  }
  p.idx += 1;

  let finished = false;
  if (p.idx >= totalOf(p)) {
    p.finishedAt = now;
    finished = true;
    maybeFinishRace(room);
  }
  room.updatedAt = now;
  markDirty(room.code);
  broadcast(room.code);

  const next = (!finished && room.status === 'racing') ? questionOf(room, p, p.idx) : null;
  return {
    correct,
    rightAnswer: correct ? undefined : q.answer,
    finished,
    next: next ? { idx: p.idx, text: next.text } : null,
    progress: p.correct,
    total: totalOf(p),
  };
}

function handleKick(room, token, body) {
  const p = room.players.find((x) => x.token === token && !x.kicked);
  if (!p || p.pid !== room.ownerPid) return err(403, '只有房主可以移出选手');
  const target = room.players.find((x) => x.pid === body.pid && !x.kicked);
  if (!target) return err(404, '找不到该选手');
  if (target.pid === room.ownerPid) return err(409, '不能移出房主');
  room.players = room.players.filter((x) => x !== target);
  room.updatedAt = Date.now();
  markDirty(room.code);
  pushEvent(room.code, target.token, 'kicked', { by: p.nickname });
  const m = conns.get(room.code);
  const set = m && m.get(target.token);
  if (set) {
    for (const res of set) { try { res.end(); } catch {} }
    m.delete(target.token);
  }
  broadcast(room.code);
  return { ok: true };
}

function handleAgain(room, token) {
  const p = room.players.find((x) => x.token === token && !x.kicked);
  if (!p || p.pid !== room.ownerPid) return err(403, '只有房主可以再来一局');
  if (room.status !== 'finished') return err(409, '比赛尚未结束');
  room.seed = newSeed();
  room.status = 'lobby';
  room.startAt = 0; room.endAt = 0; room.ranks = [];
  room.updatedAt = Date.now();
  for (const x of room.players) {
    x.idx = 0; x.correct = 0; x.wrong = 0; x.wrongList = [];
    x.finishedAt = 0; x.lastAnswerAt = 0;
  }
  markDirty(room.code);
  broadcast(room.code);
  return { ok: true };
}

function handleLeave(room, token) {
  const p = room.players.find((x) => x.token === token && !x.kicked);
  if (!p) return err(404, '不在房间中');
  if (p.pid === room.ownerPid) {
    console.log(`[math-race] room ${room.code} disbanded by owner`);
    pushEvent(room.code, '', 'closed', { reason: 'owner-left' });
    for (const [t, set] of conns.get(room.code) || []) {
      if (t) pushEvent(room.code, t, 'closed', { reason: 'owner-left' });
    }
    dropRoom(room.code);
    return { ok: true, closed: true };
  }
  room.players = room.players.filter((x) => x !== p);
  room.updatedAt = Date.now();
  markDirty(room.code);
  if (!room.players.length) dropRoom(room.code);
  else broadcast(room.code);
  return { ok: true };
}

// ---------------------------------------------------------------- 周期任务

setInterval(() => {
  const now = Date.now();
  for (const room of [...rooms.values()]) {
    if (room.status === 'racing' && room.endAt && now > room.endAt) finishRace(room);
    const idle = now - (room.updatedAt || room.createdAt);
    if (room.status === 'finished' && idle > FINISHED_TTL) dropRoom(room.code);
    else if (!conns.has(room.code) && idle > ROOM_TTL) dropRoom(room.code);
  }
}, 1000).unref();

// ---------------------------------------------------------------- HTTP

function err(status, message) { return { __err: true, status, message }; }
function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}
function notFound(res, msg) { json(res, 404, { error: msg || 'not found' }); }

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 16384) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('bad json')); }
    });
    req.on('error', reject);
  });
}

function serveClient(res) {
  let html;
  try { html = fs.readFileSync(path.join(__dirname, 'client', 'index.html')); }
  catch { return json(res, 500, { error: '客户端未构建，请先运行 python3 build.py' }); }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
  res.end(html);
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost');
    let pathname;
    try { pathname = decodeURIComponent(u.pathname); } catch { return notFound(res); }

    if (BASE) {
      if (pathname === BASE) { res.writeHead(302, { location: BASE + '/' }); return res.end(); }
      if (pathname.startsWith(BASE + '/')) pathname = pathname.slice(BASE.length);
      else return notFound(res, 'not found');
    }

    const token = u.searchParams.get('token') || '';
    const seg = pathname.split('/').filter(Boolean);

    if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) return serveClient(res);
    if (req.method === 'GET' && pathname === '/api/health') return json(res, 200, { ok: true, rooms: rooms.size });

    if (seg[0] === 'api' && seg[1] === 'rooms') {
      const code = seg[2] || '';
      if (req.method === 'POST' && seg.length === 2) {
        const body = await readBody(req);
        const r = handleCreate(body);
        if (r.__err) return json(res, r.status, { error: r.message });
        return json(res, 200, r);
      }
      if (!/^\d{8}$/.test(code)) return notFound(res, '房间不存在或已解散');
      const room = loadRoom(code);
      if (!room) return notFound(res, '房间不存在或已解散');

      if (req.method === 'GET' && seg[3] === 'events') return handleEvents(req, res, code, token);
      if (req.method === 'GET' && seg[3] === 'state') {
        return json(res, 200, publicState(room, token));
      }
      if (req.method === 'POST') {
        const body = await readBody(req);
        const t = body.token || token;
        let r;
        switch (seg[3]) {
          case 'join': r = handleJoin(room, body); break;
          case 'me': r = handleMe(room, t, body); break;
          case 'settings': r = handleSettings(room, t, body); break;
          case 'start': r = handleStart(room, t); break;
          case 'answer': r = handleAnswer(room, t, body); break;
          case 'kick': r = handleKick(room, t, body); break;
          case 'again': r = handleAgain(room, t); break;
          case 'leave': r = handleLeave(room, t); break;
          default: r = err(404, 'unknown action');
        }
        if (r.__err) return json(res, r.status, { error: r.message });
        return json(res, 200, r);
      }
    }
    return notFound(res);
  } catch (e) {
    const msg = e && e.message === 'bad json' ? '请求格式错误' : '服务器开小差了';
    if (!e || e.message !== 'bad json') console.error('[math-race]', e);
    try { json(res, e && e.message === 'bad json' ? 400 : 500, { error: msg }); } catch {}
  }
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.listen(PORT, () => {
  console.log(`[math-race] listening on :${PORT} base=${BASE || '/'} db=${DB_PATH}`);
});

function shutdown() {
  try { flush(); db.close(); } catch {}
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
