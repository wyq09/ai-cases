'use strict';

/* 基础设施：路径、DOM、请求、本地会话、小工具 */

const API = (() => {
  let p = location.pathname.replace(/index\.html$/, '');
  if (!p.endsWith('/')) p += '/';
  return p.replace(/\/$/, '');
})();

const $ = (s, el = document) => el.querySelector(s);

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
  }
  return el;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

async function api(path, body, method) {
  try {
    const res = await fetch(API + path, {
      method: method || (body ? 'POST' : 'GET'),
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: '网络开小差了，请重试' } };
  }
}

/* 本地会话：code -> { token, pid }，匿名身份全靠它恢复现场 */
const store = {
  _key: 'mr_sessions',
  all() { try { return JSON.parse(localStorage.getItem(this._key) || '{}'); } catch { return {}; } },
  get(code) { return this.all()[code] || null; },
  set(code, sess) { const a = this.all(); a[code] = sess; localStorage.setItem(this._key, JSON.stringify(a)); },
  del(code) { const a = this.all(); delete a[code]; localStorage.setItem(this._key, JSON.stringify(a)); },
};

const prefs = {
  get nick() { return localStorage.getItem('mr_nick') || ''; },
  set nick(v) { localStorage.setItem('mr_nick', v); },
  get grade() { return Number(localStorage.getItem('mr_grade')) || 3; },
  set grade(v) { localStorage.setItem('mr_grade', String(v)); },
  get sound() { return localStorage.getItem('mr_snd') !== '0'; },
  set sound(v) { localStorage.setItem('mr_snd', v ? '1' : '0'); },
};

const GRADE_NAMES = { 1: '一年级', 2: '二年级', 3: '三年级', 4: '四年级' };

const PALETTE = ['#c94f3d', '#2f6b9e', '#3f7a4e', '#d97f2f', '#2e8b8b', '#b5486b', '#8a5a2b', '#33427a', '#6b7a2f', '#5a7a8a', '#a03a78', '#48639e'];
function colorOf(pid) {
  let x = 0;
  for (const c of pid) x = (x * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[x % PALETTE.length];
}

let toastTimer = 0;
function toast(msg) {
  let t = $('#toast');
  if (!t) { t = h('div', { id: 'toast', class: 'toast' }); document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

/* 服务器时间校准：以服务端 now 为准算倒计时 */
let serverSkew = 0;
function calibrate(state) { if (state && state.serverNow) serverSkew = state.serverNow - Date.now(); }
function serverNow() { return Date.now() + serverSkew; }

function fmtClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = h('textarea', { style: 'position:fixed;opacity:0' });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    ta.remove();
    return ok;
  }
}

function joinUrl(code) {
  return `${location.origin}${API}/?code=${code}`;
}
