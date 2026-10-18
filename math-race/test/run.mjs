#!/usr/bin/env node
'use strict';

/**
 * math-race 回归测试：node test/run.mjs
 * 第一部分：出题引擎（独立表达式求值器交叉验证答案）
 * 第二部分：服务端 API 全流程（起真实进程打 HTTP）
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { genQuestion, COUNTS } = require('../questions.js');

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error('  ✗ ' + msg); }
}
function section(name) { console.log(`\n== ${name} ==`); }

/* ---------- 独立求值器：只认 + - × ÷ ( ) 与整数，优先级 ×÷ 高于 +- ---------- */

function tokenize(s) {
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ') { i++; continue; }
    if (c >= '0' && c <= '9') {
      let j = i;
      while (j < s.length && s[j] >= '0' && s[j] <= '9') j++;
      tokens.push({ t: 'num', v: Number(s.slice(i, j)) });
      i = j;
      continue;
    }
    if ('+-×÷()'.includes(c)) { tokens.push({ t: c }); i++; continue; }
    throw new Error('bad char: ' + c);
  }
  return tokens;
}

function evalExpr(text) {
  const tokens = tokenize(text);
  let pos = 0;
  const PREC = { '+': 1, '-': 1, '×': 2, '÷': 2 };
  function peek() { return tokens[pos]; }
  function parsePrimary() {
    const tk = peek();
    if (!tk) throw new Error('unexpected end');
    if (tk.t === 'num') { pos++; return tk.v; }
    if (tk.t === '(') {
      pos++;
      const v = parseExpr(0);
      if (!peek() || peek().t !== ')') throw new Error('missing )');
      pos++;
      return v;
    }
    if (tk.t === '-') { pos++; return -parsePrimary(); }
    throw new Error('bad primary: ' + tk.t);
  }
  function parseExpr(minPrec) {
    let left = parsePrimary();
    for (;;) {
      const tk = peek();
      if (!tk || !(tk.t in PREC) || PREC[tk.t] < minPrec) return left;
      pos++;
      const right = parseExpr(PREC[tk.t] + 1);
      if (tk.t === '+') left += right;
      else if (tk.t === '-') left -= right;
      else if (tk.t === '×') left *= right;
      else left /= right;
    }
  }
  const v = parseExpr(0);
  if (pos !== tokens.length) throw new Error('trailing tokens');
  return v;
}

/* ---------- 第一部分：出题引擎 ---------- */

section('出题引擎');
{
  const legal = /^[0-9() +×÷-]+$/;
  for (const grade of [1, 2, 3, 4]) {
    let kinds = new Set();
    for (let i = 0; i < 3000; i++) {
      const q = genQuestion(grade, `g${grade}:${i}`);
      ok(Number.isInteger(q.answer), `G${grade} #${i} 答案非整数: ${q.text} = ${q.answer}`);
      ok(q.answer >= 0, `G${grade} #${i} 答案为负: ${q.text} = ${q.answer}`);
      ok(legal.test(q.text), `G${grade} #${i} 题面含非法字符: ${q.text}`);
      let ev;
      try { ev = evalExpr(q.text); } catch (e) { ok(false, `G${grade} #${i} 题面无法解析: ${q.text} (${e.message})`); continue; }
      ok(ev === q.answer, `G${grade} #${i} 答案不符: ${q.text} 引擎=${q.answer} 求值=${ev}`);
      kinds.add(q.kind);
    }
    ok(kinds.size >= 4, `G${grade} 题型覆盖不足（${kinds.size} 种）`);
    // 确定性
    const a = genQuestion(grade, 'fixed-seed'), b = genQuestion(grade, 'fixed-seed');
    ok(a.text === b.text && a.answer === b.answer, `G${grade} 同 seed 不同题`);
  }
  ok(COUNTS[1] > COUNTS[4], '低年级题量应多于高年级（配平赛时）');
  console.log(`  引擎: 每年级 3000 题 × 交叉验证完成`);
}

/* ---------- 第二部分：服务端 ---------- */

const PORT = 18923;
const BASE = 'http://127.0.0.1:' + PORT + '/math-race';
const TMP_DB = path.join(__dirname, '.tmp-test-rooms.db');

function waitListening(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server start timeout')), 8000);
    child.stdout.on('data', (d) => {
      if (String(d).includes('listening')) { clearTimeout(timer); resolve(); }
    });
    child.stderr.on('data', (d) => process.stderr.write(d));
  });
}

function startServer() {
  return spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), DB_PATH: TMP_DB },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function req(method, p, body) {
  const res = await fetch(BASE + p, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const evalAns = (text) => evalExpr(text);

async function serverTests() {
  section('服务端 API');
  fs.rmSync(TMP_DB, { force: true });
  let child = startServer();
  await waitListening(child);

  try {
    // 健康检查 & 静态页
    let r = await req('GET', '/api/health');
    ok(r.status === 200 && r.data.ok, 'health 检查');
    r = await fetch(BASE + '/');
    const html = await r.text();
    ok(r.status === 200 && html.includes('口算竞速场'), '静态客户端页');

    // 建房 + 加入
    r = await req('POST', '/api/rooms', { nickname: '房主', grade: 3 });
    ok(r.status === 200 && /^\d{8}$/.test(r.data.code), '建房返回 8 位房间号');
    const code = r.data.code;
    const owner = { token: r.data.token, pid: r.data.pid };

    r = await req('POST', `/api/rooms/${code}/join`, { nickname: '小萌', grade: 1 });
    ok(r.status === 200 && r.data.token, '加入房间');
    const p2 = { token: r.data.token, pid: r.data.pid };

    r = await req('POST', `/api/rooms/${code}/join`, { nickname: '大萌', grade: 4 });
    const p3 = { token: r.data.token, pid: r.data.pid };

    r = await req('POST', '/api/rooms/99999999/join', { nickname: 'x', grade: 1 });
    ok(r.status === 404, '不存在的房间返回 404');
    r = await req('POST', `/api/rooms/${code}/join`, { nickname: 'x', grade: 9 });
    ok(r.status === 200, '年级越界会被钳制而非报错');
    const p4 = { token: r.data.token, pid: r.data.pid };
    await req('POST', `/api/rooms/${code}/kick`, { token: owner.token, pid: p4.pid });

    // 状态
    r = await req('GET', `/api/rooms/${code}/state?token=${owner.token}`);
    ok(r.status === 200 && r.data.players.length === 3, '踢人后剩 3 人');
    ok(r.data.meta && r.data.meta.counts, 'state 携带题量配置');
    ok(!JSON.stringify(r.data).includes('"answer"'), '公开状态不泄露答案');

    // 开局权限
    r = await req('POST', `/api/rooms/${code}/start`, { token: p2.token });
    ok(r.status === 403, '非房主不能开始');
    r = await req('POST', `/api/rooms/${code}/start`, { token: owner.token });
    ok(r.status === 200, '房主开始比赛');
    r = await req('GET', `/api/rooms/${code}/state?token=${p2.token}`);
    ok(r.data.status === 'racing' && r.data.startAt > Date.now() - 1000, '进入 racing，startAt 有倒计时');
    ok(r.data.you && r.data.you.question && r.data.you.question.idx === 0, '携带个人首题（无答案）');

    // 未到开赛时间不能答
    r = await req('POST', `/api/rooms/${code}/answer`, { token: p2.token, idx: 0, answer: 1 });
    ok(r.status === 409, '倒计时内提交被拒绝');

    // 等倒计时结束
    await new Promise((res) => setTimeout(res, 3400));

    // p2（一年级，15 题）打满全场（每题间隔 > 服务端 250ms 防连点限速）
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    let wrongLogged = false;
    for (let i = 0; i < COUNTS[1]; i++) {
      await sleep(300);
      const s = await req('GET', `/api/rooms/${code}/state?token=${p2.token}`);
      const q = s.data.you.question;
      ok(q && q.idx === i, `p2 第 ${i} 题下发的题号正确`);
      let ans = evalAns(q.text);
      if (i === 2) { ans += 1; } // 故意错一次
      r = await req('POST', `/api/rooms/${code}/answer`, { token: p2.token, idx: i, answer: ans });
      ok(r.status === 200, `p2 提交第 ${i} 题成功`);
      if (i === 2) {
        wrongLogged = r.data.correct === false && r.data.rightAnswer === ans - 1;
        ok(wrongLogged, '答错返回正确答案');
      } else {
        ok(r.data.correct === true, `p2 第 ${i} 题判对`);
      }
      ok(r.data.next || i === COUNTS[1] - 1, `p2 第 ${i} 题返回下一题`);
      if (i === 0) {
        const r2 = await req('POST', `/api/rooms/${code}/answer`, { token: p2.token, idx: 0, answer: 0 });
        ok(r2.status === 409, '重复提交旧题号被拒绝（幂等）');
      }
    }
    r = await req('GET', `/api/rooms/${code}/state?token=${p2.token}`);
    ok(r.data.you.finished === true, 'p2 完赛');
    ok(r.data.you.wrongList.length === 1 && r.data.you.wrongList[0].right !== undefined, '错题记录含正确答案');
    r = await req('POST', `/api/rooms/${code}/answer`, { token: p2.token, idx: 99, answer: 1 });
    ok(r.status === 409, '完赛后不能再提交');

    // p1（三年级 10 题）也打完 → 全员完赛自动结算（p3 未完赛）
    for (let i = 0; i < COUNTS[3]; i++) {
      await sleep(300);
      const s = await req('GET', `/api/rooms/${code}/state?token=${owner.token}`);
      const q = s.data.you.question;
      await req('POST', `/api/rooms/${code}/answer`, { token: owner.token, idx: i, answer: evalAns(q.text) });
    }
    r = await req('GET', `/api/rooms/${code}/state`);
    ok(r.data.status === 'racing', '还有人没完赛，比赛继续');
    ok(r.data.ranks.length === 0 || r.data.ranks.length > 0, 'ranks 字段存在');

    // SSE
    {
      const ctrl = new AbortController();
      const res = await fetch(`${BASE}/api/rooms/${code}/events`, { signal: ctrl.signal });
      const reader = res.body.getReader();
      const { value } = await reader.read();
      const text = new TextDecoder().decode(value);
      ok(res.status === 200 && text.includes('event: state'), 'SSE 推送初始状态');
      ok(res.headers.get('x-accel-buffering') === 'no', 'SSE 带 no-buffering 头（反代友好）');
      ctrl.abort();
    }

    // 再来一局权限 & 状态重置
    r = await req('POST', `/api/rooms/${code}/again`, { token: p2.token });
    ok(r.status === 403, '非房主不能再来一局');
    r = await req('POST', `/api/rooms/${code}/again`, { token: owner.token });
    ok(r.status === 409, '比赛未结束不能再来一局');

    // 离开 & 解散
    r = await req('POST', `/api/rooms/${code}/leave`, { token: p3.token });
    ok(r.status === 200, '成员退出');
    r = await req('POST', `/api/rooms/${code}/leave`, { token: p2.token });
    ok(r.status === 200, '成员退出 2');

    // 持久化：重启后房间还在
    child.kill('SIGTERM');
    await new Promise((res) => setTimeout(res, 400));
    child = startServer();
    await waitListening(child);
    r = await req('GET', `/api/rooms/${code}/state?token=${owner.token}`);
    ok(r.status === 200 && r.data.code === code, '服务重启后房间从 SQLite 恢复');
    ok(r.data.players.length === 1, '重启后成员名单一致');

    // 房主解散
    r = await req('POST', `/api/rooms/${code}/leave`, { token: owner.token });
    ok(r.status === 200 && r.data.closed, '房主退出即解散');
    r = await req('GET', `/api/rooms/${code}/state`);
    ok(r.status === 404, '解散后房间 404');
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(TMP_DB, { force: true });
  }
}

(async () => {
  try {
    await serverTests();
  } catch (e) {
    failed++;
    console.error('\n[fatal]', e);
  }
  console.log(`\n===== ${passed} passed, ${failed} failed =====`);
  process.exit(failed ? 1 : 0);
})();
