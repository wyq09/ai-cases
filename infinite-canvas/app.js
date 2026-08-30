'use strict';
/* ============================================================
   无限画布 · Infinite Canvas
   相机(world→screen)： screen = world * z + cam
   ============================================================ */

/* ---------- 小工具 ---------- */
const $ = s => document.querySelector(s);
const uid = () => 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const dist = (x, y) => Math.hypot(x, y);
const NS = 'http://www.w3.org/2000/svg';
const svgEl = t => document.createElementNS(NS, t);

/* ---------- 状态 ---------- */
const S = {
  cam: { x: 0, y: 0, z: 1 },
  nodes: [],            // {id,type,x,y,w,h,...}  type: image|video|text|note
  edges: [],            // {id,a,b}
  sel: new Set(),
  selE: new Set(),
  tool: 'select',
};
let editingId = null;
let spacePan = false;
let drag = null;                       // 指针状态机
let lastMouse = { x: innerWidth / 2, y: innerHeight / 2 };
let pasteCascade = 0, pasteTimer = 0;

/* ---------- DOM ---------- */
const viewport = $('#viewport'), world = $('#world'), edgeSvg = $('#edges');
const gridEl = $('#grid'), marqueeEl = $('#marquee'), toastEl = $('#toast');
const emptyHint = $('#empty-hint'), dropHint = $('#drop-hint'), helpMask = $('#help-mask');
const saveStateEl = $('#save-state'), coordsEl = $('#coords');
const nodeEls = new Map();             // id -> element
const edgeEls = new Map();             // id -> {g,hit,line,arrow}
const assets = new Map();              // assetId -> {url}

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const modKey = e => isMac ? e.metaKey : e.ctrlKey;

/* ============================================================
   相机
   ============================================================ */
const toWorld = (px, py) => ({ x: (px - S.cam.x) / S.cam.z, y: (py - S.cam.y) / S.cam.z });
const toScreen = (wx, wy) => ({ x: wx * S.cam.z + S.cam.x, y: wy * S.cam.z + S.cam.y });

function applyCam() {
  world.style.transform = `translate(${S.cam.x}px,${S.cam.y}px) scale(${S.cam.z})`;
  // 点阵网格：随缩放放疏密，太密时自动翻倍间距
  let g = 28;
  while (g * S.cam.z < 15) g *= 2;
  const px = g * S.cam.z;
  gridEl.style.backgroundSize = `${px}px ${px}px`;
  gridEl.style.backgroundPosition = `${S.cam.x}px ${S.cam.y}px`;
  gridEl.style.opacity = clamp((S.cam.z - 0.08) * 2.2, 0.15, 1);
  $('#zoom-pct').textContent = Math.round(S.cam.z * 100) + '%';
  renderEdges();
}

function zoomAt(px, py, factor) { zoomAbs(px, py, S.cam.z * factor); }
function zoomAbs(px, py, z2) {
  z2 = clamp(z2, 0.04, 5);
  S.cam.x = px - (px - S.cam.x) * (z2 / S.cam.z);
  S.cam.y = py - (py - S.cam.y) * (z2 / S.cam.z);
  S.cam.z = z2;
  applyCam();
}
function viewportCenterWorld() { return toWorld(innerWidth / 2, innerHeight / 2); }

function fitView() {
  if (!S.nodes.length) { S.cam = { x: innerWidth / 2, y: innerHeight / 2, z: 1 }; applyCam(); return; }
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const n of S.nodes) {
    x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y);
    x1 = Math.max(x1, n.x + n.w); y1 = Math.max(y1, n.y + n.h);
  }
  const bw = x1 - x0, bh = y1 - y0;
  const z = clamp(Math.min((innerWidth - 150) / bw, (innerHeight - 190) / bh), 0.05, 1.15);
  S.cam.z = z;
  S.cam.x = innerWidth / 2 - (x0 + bw / 2) * z;
  S.cam.y = innerHeight / 2 - (y0 + bh / 2) * z;
  applyCam();
}

/* ============================================================
   IndexedDB 持久化（场景 JSON + 素材 Blob）
   ============================================================ */
let db = null;
function openDB() {
  return new Promise(res => {
    try {
      const rq = indexedDB.open('infinite-canvas-db', 1);
      rq.onupgradeneeded = e => {
        const d = e.target.result;
        d.createObjectStore('kv');
        d.createObjectStore('assets');
      };
      rq.onsuccess = e => { db = e.target.result; res(); };
      rq.onerror = () => res();
    } catch (e) { res(); }
  });
}
const idbPut = (store, key, val) => new Promise(res => {
  if (!db) return res(false);
  try {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(val, key);
    tx.oncomplete = () => res(true);
    tx.onerror = () => res(false);
  } catch (e) { res(false); }
});
const idbGet = (store, key) => new Promise(res => {
  if (!db) return res(null);
  try {
    const rq = db.transaction(store).objectStore(store).get(key);
    rq.onsuccess = () => res(rq.result ?? null);
    rq.onerror = () => res(null);
  } catch (e) { res(null); }
});
const idbAll = store => new Promise(res => {
  if (!db) return res([]);
  try {
    const o = db.transaction(store).objectStore(store);
    const kq = o.getAllKeys(), vq = o.getAll();
    kq.onsuccess = () => vq.onsuccess = () => res(kq.result.map((k, i) => [k, vq.result[i]]));
    kq.onerror = vq.onerror = () => res([]);
  } catch (e) { res([]); }
});

function serialize() {
  return JSON.stringify({ cam: S.cam, nodes: S.nodes, edges: S.edges, v: 1 });
}
let saveTimer = 0;
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 700); }
async function saveNow() {
  saveStateEl.textContent = '保存中…'; saveStateEl.style.color = 'var(--dim)';
  const ok = await idbPut('kv', 'scene', serialize());
  saveStateEl.textContent = ok ? '已自动保存 ' + new Date().toTimeString().slice(0, 5) : '保存失败 · 仅本次会话';
  saveStateEl.style.color = ok ? 'var(--dim-2)' : 'var(--danger)';
}

/* ============================================================
   素材
   ============================================================ */
async function addAsset(blob) {
  const id = uid();
  assets.set(id, { url: URL.createObjectURL(blob) });
  idbPut('assets', id, blob);
  return id;
}
const srcOf = n => n.srcKind === 'asset' ? (assets.get(n.src)?.url ?? '') : n.src;

const imageSize = url => new Promise((res, rej) => {
  const im = new Image();
  im.onload = () => res({ w: im.naturalWidth || 800, h: im.naturalHeight || 600 });
  im.onerror = rej;
  im.src = url;
});
const videoSize = url => new Promise((res, rej) => {
  const v = document.createElement('video');
  v.preload = 'metadata'; v.muted = true;
  const fail = () => rej(new Error('video meta'));
  const to = setTimeout(fail, 8000);
  v.onloadedmetadata = () => { clearTimeout(to); res({ w: v.videoWidth || 640, h: v.videoHeight || 360 }); };
  v.onerror = () => { clearTimeout(to); fail(); };
  v.src = url;
});

/* ============================================================
   节点 DOM
   ============================================================ */
const nodeById = id => S.nodes.find(n => n.id === id);

/* 编辑中内容变化 → 节点包围盒跟随（连线锚点才能贴住边缘） */
function bindEditInput(n, body) {
  body.addEventListener('input', () => {
    if (editingId !== n.id) return;
    syncNodeEl(n);
    renderEdges();
  });
}

function makeNodeEl(n) {
  const el = document.createElement('div');
  el.className = 'node ' + n.type;
  el.dataset.id = n.id;

  if (n.type === 'image') {
    const clip = document.createElement('div');
    clip.className = 'clip';
    const img = document.createElement('img');
    img.draggable = false;
    img.onerror = () => el.classList.add('broken');
    img.src = srcOf(n);
    clip.appendChild(img);
    el.appendChild(clip);
  } else if (n.type === 'video') {
    const clip = document.createElement('div');
    clip.className = 'clip';
    const v = document.createElement('video');
    v.controls = true; v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'metadata';
    v.onerror = () => el.classList.add('broken');
    v.src = srcOf(n);
    clip.appendChild(v);
    el.appendChild(clip);
  } else if (n.type === 'text') {
    const b = document.createElement('div');
    b.className = 'tbody'; b.contentEditable = 'true'; b.spellcheck = false;
    b.textContent = n.text || '';
    if (n.fs) b.style.fontSize = n.fs + 'px';
    if (n.color) b.style.color = n.color;
    if (n.mw) b.style.maxWidth = n.mw + 'px';
    bindEditInput(n, b);
    el.appendChild(b);
  } else if (n.type === 'note') {
    const clip = document.createElement('div');
    clip.className = 'clip';
    clip.style.setProperty('--note', n.color || 'var(--note-1)');
    const b = document.createElement('div');
    b.className = 'nbody'; b.contentEditable = 'true'; b.spellcheck = false;
    b.textContent = n.text || '';
    bindEditInput(n, b);
    clip.appendChild(b);
    el.appendChild(clip);
  }

  // 连线圆点（四边中点）
  for (const side of ['n', 'e', 's', 'w']) {
    const p = document.createElement('span');
    p.className = 'port ' + side; p.dataset.side = side;
    el.appendChild(p);
  }
  // 缩放手柄（四角）
  for (const c of ['nw', 'ne', 'sw', 'se']) {
    const h = document.createElement('span');
    h.className = 'hdl ' + c; h.dataset.corner = c;
    el.appendChild(h);
  }
  nodeEls.set(n.id, el);
  return el;
}

function syncNodeEl(n) {
  const el = nodeEls.get(n.id);
  if (!el) return;
  el.style.left = n.x + 'px';
  el.style.top = n.y + 'px';
  if (n.type !== 'text') {
    el.style.width = n.w + 'px';
    el.style.height = n.h + 'px';
  } else {
    n.w = el.offsetWidth || n.w; n.h = el.offsetHeight || n.h;
  }
}
const bringToFront = n => {
  const i = S.nodes.indexOf(n);
  if (i >= 0) { S.nodes.splice(i, 1); S.nodes.push(n); }
  world.appendChild(nodeEls.get(n.id));
};

function renderAll() {
  for (const [, el] of nodeEls) el.remove();
  nodeEls.clear();
  for (const n of S.nodes) { world.appendChild(makeNodeEl(n)); syncNodeEl(n); }
  for (const [, e] of edgeEls) e.g.remove();
  edgeEls.clear();
  for (const e of S.edges) mountEdge(e);
  updateSelUI();
  updateCounts();
}

const resizableType = t => t === 'image' || t === 'video' || t === 'note';

/* ============================================================
   连线
   ============================================================ */
function edgeGeo(a, b) {
  const dx = (b.x + b.w / 2) - (a.x + a.w / 2);
  const dy = (b.y + b.h / 2) - (a.y + a.h / 2);
  let p, q, d1, d2;
  if (Math.abs(dx) >= Math.abs(dy)) {
    p = { x: dx > 0 ? a.x + a.w : a.x, y: a.y + a.h / 2 };
    q = { x: dx > 0 ? b.x : b.x + b.w, y: b.y + b.h / 2 };
    d1 = { x: dx > 0 ? 1 : -1, y: 0 }; d2 = { x: -d1.x, y: 0 };
  } else {
    p = { x: a.x + a.w / 2, y: dy > 0 ? a.y + a.h : a.y };
    q = { x: b.x + b.w / 2, y: dy > 0 ? b.y : b.y + b.h };
    d1 = { x: 0, y: dy > 0 ? 1 : -1 }; d2 = { x: 0, y: -d1.y };
  }
  const k = clamp(dist(dx, dy) * 0.42, 36, 240);
  const c1 = { x: p.x + d1.x * k, y: p.y + d1.y * k };
  const c2 = { x: q.x + d2.x * k, y: q.y + d2.y * k };
  const dPath = `M ${p.x} ${p.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${q.x} ${q.y}`;
  const ang = Math.atan2(q.y - c2.y, q.x - c2.x);
  const s = 10 / S.cam.z;                      // 箭头保持屏幕尺寸恒定
  const ax = t => q.x - Math.cos(ang - t) * s;
  const ay = t => q.y - Math.sin(ang - t) * s;
  const dArrow = `M ${q.x} ${q.y} L ${ax(0.42)} ${ay(0.42)} L ${ax(-0.42)} ${ay(-0.42)} Z`;
  return { dPath, dArrow };
}

function mountEdge(e) {
  const g = svgEl('g'); g.dataset.id = e.id;
  const hit = svgEl('path'); hit.setAttribute('class', 'hit');
  const line = svgEl('path'); line.setAttribute('class', 'line');
  const arrow = svgEl('path'); arrow.setAttribute('class', 'arrow');
  g.append(hit, line, arrow);
  hit.addEventListener('pointerdown', ev => {
    ev.stopPropagation();
    setSel([], [e.id]);
    ev.preventDefault();
  });
  hit.addEventListener('dblclick', ev => {
    ev.stopPropagation();
    removeEdge(e.id); pushHistory();
  });
  edgeSvg.appendChild(g);
  const rec = { g, hit, line, arrow };
  edgeEls.set(e.id, rec);
  return rec;
}

function renderEdges() {
  const alive = new Set();
  for (const e of S.edges) {
    alive.add(e.id);
    const a = nodeById(e.a), b = nodeById(e.b);
    if (!a || !b) continue;
    let rec = edgeEls.get(e.id);
    if (!rec) rec = mountEdge(e);
    const { dPath, dArrow } = edgeGeo(a, b);
    rec.hit.setAttribute('d', dPath);
    rec.line.setAttribute('d', dPath);
    rec.arrow.setAttribute('d', dArrow);
    rec.g.classList.toggle('sel', S.selE.has(e.id));
  }
  for (const [id, rec] of edgeEls) if (!alive.has(id)) { rec.g.remove(); edgeEls.delete(id); }
}

const hasEdge = (a, b) => S.edges.some(e => (e.a === a && e.b === b) || (e.a === b && e.b === a));
function addEdge(a, b, quiet) {
  if (a === b || hasEdge(a, b)) { if (!quiet) toast('这两个节点之间已有连线'); return false; }
  S.edges.push({ id: uid(), a, b });
  renderEdges(); updateCounts();
  return true;
}
function removeEdge(id) {
  S.edges = S.edges.filter(e => e.id !== id);
  S.selE.delete(id);
  renderEdges(); updateCounts();
}

/* 临时连线（拖拽中） */
let tempPath = null;
function showTempEdge(a, wp) {
  if (!tempPath) { tempPath = svgEl('path'); tempPath.setAttribute('class', 'line'); edgeSvg.appendChild(tempPath); }
  const { dPath } = edgeGeo(a, { x: wp.x - 0.5, y: wp.y - 0.5, w: 1, h: 1 });
  tempPath.setAttribute('d', dPath);
  tempPath.style.stroke = 'var(--accent)';
  tempPath.style.strokeDasharray = '5 5';
}
function hideTempEdge() { if (tempPath) { tempPath.remove(); tempPath = null; } }

/* ============================================================
   选择
   ============================================================ */
function setSel(ids = [], edgeIds = []) {
  S.sel = new Set(ids);
  S.selE = new Set(edgeIds);
  updateSelUI();
  renderEdges();
}
function updateSelUI() {
  for (const [id, el] of nodeEls) {
    const on = S.sel.has(id);
    const n = nodeById(id);
    el.classList.toggle('sel', on);
    el.classList.toggle('resizable', on && S.sel.size === 1 && !!n && resizableType(n.type));
  }
}

/* ============================================================
   历史（撤销 / 重做）
   ============================================================ */
let hist = [], hi = -1;
function pushHistory() {
  hist = hist.slice(0, hi + 1);
  hist.push(serialize());
  if (hist.length > 60) hist.shift();
  hi = hist.length - 1;
  updateUndoUI();
  saveSoon();
}
function loadSnap(s) {
  const d = JSON.parse(s);
  S.nodes = d.nodes; S.edges = d.edges;
  S.sel.clear(); S.selE.clear();
  if (editingId) exitEdit(false);
  renderAll(); applyCam();
  saveSoon();
}
function undo() { if (hi > 0) { hi--; loadSnap(hist[hi]); updateUndoUI(); } }
function redo() { if (hi < hist.length - 1) { hi++; loadSnap(hist[hi]); updateUndoUI(); } }
function updateUndoUI() {
  $('#btn-undo').disabled = hi <= 0;
  $('#btn-redo').disabled = hi >= hist.length - 1;
}

/* ============================================================
   指针状态机：pan / move / marquee / resize / connect
   ============================================================ */
viewport.addEventListener('pointerdown', onDown);
viewport.addEventListener('pointermove', onMove);
viewport.addEventListener('pointerup', onUp);
viewport.addEventListener('pointercancel', onUp);

function onDown(e) {
  if (e.button === 2) return;
  closeHelp();

  // 编辑中：节点内点击交给原生光标行为
  if (editingId) {
    const el = nodeEls.get(editingId);
    if (el && el.contains(e.target)) return;
    exitEdit(true);
  }

  const nodeEl = e.target.closest?.('.node');
  const port = e.target.closest?.('.port');
  const hdl = e.target.closest?.('.hdl');
  const isEdgeHit = e.target.classList?.contains('hit');

  // —— 平移（中键 / 空格 / 抓手工具）
  if (e.button === 1 || spacePan || S.tool === 'hand') {
    drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, cx: S.cam.x, cy: S.cam.y };
    viewport.classList.add('panning');
    viewport.setPointerCapture(e.pointerId);
    e.preventDefault();
    return;
  }

  // —— 从圆点拖出连线
  if (port && nodeEl) {
    const n = nodeById(nodeEl.dataset.id);
    if (!n) return;
    drag = { mode: 'connect', from: n };
    document.body.classList.add('connecting');
    viewport.setPointerCapture(e.pointerId);
    e.preventDefault();
    return;
  }

  // —— 缩放手柄
  if (hdl && nodeEl && S.sel.size === 1) {
    const n = nodeById(nodeEl.dataset.id);
    if (n && resizableType(n.type)) {
      drag = {
        mode: 'resize', corner: hdl.dataset.corner, node: n,
        sx: e.clientX, sy: e.clientY,
        start: { x: n.x, y: n.y, w: n.w, h: n.h },
        w0: toWorld(e.clientX, e.clientY),
      };
      viewport.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
  }

  // —— 节点：选择 / 拖动
  if (nodeEl) {
    const n = nodeById(nodeEl.dataset.id);
    if (!n) return;
    if (e.shiftKey) {
      S.sel.has(n.id) ? S.sel.delete(n.id) : S.sel.add(n.id);
      updateSelUI(); renderEdges();
      return;                                  // shift 点击只做增删选
    }
    if (!S.sel.has(n.id)) setSel([n.id]);
    drag = {
      mode: 'move', moved: false,
      sx: e.clientX, sy: e.clientY,
      orig: [...S.sel].map(id => {
        const m = nodeById(id);
        return { id, x: m.x, y: m.y };
      }),
    };
    viewport.setPointerCapture(e.pointerId);
    e.preventDefault();
    return;
  }

  // —— 连线命中
  if (isEdgeHit) return;                       // pointerdown 已处理选择

  // —— 空白处
  const wp = toWorld(e.clientX, e.clientY);
  if (S.tool === 'text') { addText(wp, '', { edit: true }); setTool('select'); return; }
  if (S.tool === 'note') { addNote(wp, ''); setTool('select'); return; }
  drag = { mode: 'marquee', sx: e.clientX, sy: e.clientY, w0: wp, moved: false };
  viewport.setPointerCapture(e.pointerId);
}

function onMove(e) {
  lastMouse = { x: e.clientX, y: e.clientY };
  const wp = toWorld(e.clientX, e.clientY);
  coordsEl.textContent = `x ${Math.round(wp.x)} · y ${Math.round(wp.y)}`;

  if (!drag) return;
  const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;

  if (drag.mode === 'pan') {
    S.cam.x = drag.cx + dx; S.cam.y = drag.cy + dy;
    applyCam();
  }
  else if (drag.mode === 'move') {
    if (!drag.moved && dist(dx, dy) > 3) {
      drag.moved = true;
      for (const id of S.sel) bringToFront(nodeById(id));
    }
    if (drag.moved) {
      const dwx = dx / S.cam.z, dwy = dy / S.cam.z;
      for (const o of drag.orig) {
        const n = nodeById(o.id);
        n.x = o.x + dwx; n.y = o.y + dwy;
        syncNodeEl(n);
      }
      renderEdges();
    }
  }
  else if (drag.mode === 'marquee') {
    drag.moved = drag.moved || dist(dx, dy) > 4;
    const x = Math.min(drag.sx, e.clientX), y = Math.min(drag.sy, e.clientY);
    marqueeEl.hidden = false;
    marqueeEl.style.left = x + 'px'; marqueeEl.style.top = y + 'px';
    marqueeEl.style.width = Math.abs(dx) + 'px'; marqueeEl.style.height = Math.abs(dy) + 'px';
    const a = drag.w0, b = wp;
    const rx0 = Math.min(a.x, b.x), ry0 = Math.min(a.y, b.y);
    const rx1 = Math.max(a.x, b.x), ry1 = Math.max(a.y, b.y);
    setSel(S.nodes.filter(n => n.x < rx1 && n.x + n.w > rx0 && n.y < ry1 && n.y + n.h > ry0).map(n => n.id));
  }
  else if (drag.mode === 'resize') {
    const n = drag.node, st = drag.start;
    const dwx = (e.clientX - drag.sx) / S.cam.z, dwy = (e.clientY - drag.sy) / S.cam.z;
    let w = drag.corner.includes('e') ? st.w + dwx : st.w - dwx;
    let h = drag.corner.includes('s') ? st.h + dwy : st.h - dwy;
    if (n.type === 'image' || n.type === 'video') {
      w = Math.max(48, w);
      h = w * (st.h / st.w);
    } else { w = Math.max(56, w); h = Math.max(48, h); }
    n.w = w; n.h = h;
    n.x = drag.corner.includes('e') ? st.x : st.x + st.w - w;
    n.y = drag.corner.includes('s') ? st.y : st.y + st.h - h;
    syncNodeEl(n); renderEdges();
  }
  else if (drag.mode === 'connect') {
    showTempEdge(drag.from, wp);
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.node');
    for (const [, el] of nodeEls) el.classList.toggle('drop-target', !!over && el === over && el !== nodeEls.get(drag.from.id));
  }
}

function onUp(e) {
  if (!drag) return;
  const d = drag; drag = null;
  viewport.classList.remove('panning');
  document.body.classList.remove('connecting');
  hideTempEdge();

  if (d.mode === 'move' && d.moved) pushHistory();
  else if (d.mode === 'marquee') {
    marqueeEl.hidden = true;
    if (!d.moved) setSel([]);
  }
  else if (d.mode === 'resize') pushHistory();
  else if (d.mode === 'connect') {
    for (const [, el] of nodeEls) el.classList.remove('drop-target');
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.node');
    const targetId = over?.dataset.id;
    if (targetId && targetId !== d.from.id) {
      if (addEdge(d.from.id, targetId)) pushHistory();
    }
  }
}

/* ============================================================
   滚轮 / 触控板
   ============================================================ */
viewport.addEventListener('wheel', e => {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.011));
  else { S.cam.x -= e.deltaX; S.cam.y -= e.deltaY; applyCam(); }
}, { passive: false });

let gestureZ0 = 1;
window.addEventListener('gesturestart', e => { gestureZ0 = S.cam.z; e.preventDefault(); });
window.addEventListener('gesturechange', e => {
  e.preventDefault();
  zoomAbs(e.clientX, e.clientY, gestureZ0 * e.scale);
});

/* ============================================================
   文字编辑
   ============================================================ */
function startEdit(n) {
  const el = nodeEls.get(n.id);
  if (!el) return;
  editingId = n.id;
  el.classList.add('editing', 'sel');
  el.querySelector('[contenteditable]').focus();
}
function exitEdit(commit) {
  const n = nodeById(editingId);
  const el = n && nodeEls.get(n.id);
  editingId = null;
  if (!el) return;
  const body = el.querySelector('[contenteditable]');
  const before = n.text;
  n.text = body.innerText.replace(/\n$/, '');
  el.classList.remove('editing');
  body.blur();
  if (commit) {
    if (!n.text.trim() && (n.type === 'text' || n.type === 'note')) {
      deleteNodes([n.id]);                          // 空文字自动消失
      pushHistory();
    } else if (n.text !== before) {
      syncNodeEl(n); renderEdges();
      pushHistory();
    }
  }
}

/* ============================================================
   节点创建
   ============================================================ */
function commitNode(n, opts = {}) {
  S.nodes.push(n);
  world.appendChild(makeNodeEl(n));
  syncNodeEl(n);
  if (opts.select !== false) setSel([n.id]);
  updateCounts();
  if (!opts.silent) pushHistory();
  return n;
}

async function addImageBlob(blob, pos, opts = {}) {
  if (!blob || !blob.type.startsWith('image/')) return null;
  const tmp = URL.createObjectURL(blob);
  try {
    const dim = await imageSize(tmp);
    const id = await addAsset(blob);
    const k = Math.min(1, 480 / Math.max(dim.w, dim.h));
    const w = Math.max(60, Math.round(dim.w * k)), h = Math.max(60, Math.round(dim.h * k));
    return commitNode({
      id: uid(), type: 'image', srcKind: 'asset', src: id, nw: dim.w, nh: dim.h,
      x: Math.round(pos.x - w / 2), y: Math.round(pos.y - h / 2), w, h,
    }, opts);
  } catch (e) {
    toast('这张图片读取失败');
    return null;
  } finally { URL.revokeObjectURL(tmp); }
}

async function addVideoBlob(blob, pos, opts = {}) {
  if (!blob || !blob.type.startsWith('video/')) return null;
  const id = await addAsset(blob);
  const url = assets.get(id).url;
  try {
    const dim = await videoSize(url);
    const k = Math.min(1, 520 / Math.max(dim.w, dim.h));
    const w = Math.max(120, Math.round(dim.w * k)), h = Math.max(90, Math.round(dim.h * k));
    return commitNode({
      id: uid(), type: 'video', srcKind: 'asset', src: id, nw: dim.w, nh: dim.h,
      x: Math.round(pos.x - w / 2), y: Math.round(pos.y - h / 2), w, h,
    }, opts);
  } catch (e) {
    toast('这个视频格式无法播放');
    return null;
  }
}

function addImageURL(url, pos, opts = {}) {
  const n = commitNode({
    id: uid(), type: 'image', srcKind: 'url', src: url,
    x: Math.round(pos.x - 200), y: Math.round(pos.y - 140), w: 400, h: 280,
  }, opts);
  // 拿到真实尺寸后校正
  imageSize(url).then(dim => {
    if (!S.nodes.includes(n)) return;
    const k = Math.min(1, 480 / Math.max(dim.w, dim.h));
    n.w = Math.round(dim.w * k); n.h = Math.round(dim.h * k);
    n.x = Math.round(pos.x - n.w / 2); n.y = Math.round(pos.y - n.h / 2);
    n.nw = dim.w; n.nh = dim.h;
    syncNodeEl(n); renderEdges();
  }).catch(() => {});
  return n;
}

function addText(pos, str, opts = {}) {
  const n = commitNode({
    id: uid(), type: 'text', text: str,
    fs: opts.fs || 32, color: opts.color || '', mw: opts.mw || 640,
    x: Math.round(pos.x), y: Math.round(pos.y), w: 10, h: 10,
  }, opts);
  syncNodeEl(n);
  if (opts.edit) startEdit(n);
  return n;
}

const NOTE_COLORS = ['var(--note-1)', 'var(--note-2)', 'var(--note-3)', 'var(--note-4)', 'var(--note-5)'];
function addNote(pos, str, opts = {}) {
  return commitNode({
    id: uid(), type: 'note', text: str,
    color: opts.color || NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)],
    x: Math.round(pos.x - 130), y: Math.round(pos.y - 95), w: 260, h: 190,
  }, opts);
}

function deleteNodes(ids) {
  const set = new Set(ids);
  S.nodes = S.nodes.filter(n => !set.has(n.id));
  S.edges = S.edges.filter(e => !set.has(e.a) && !set.has(e.b));
  S.sel.clear(); S.selE.clear();
  renderAll();
}
function deleteSelection() {
  if (!S.sel.size && !S.selE.size) return;
  deleteNodes([...S.sel]);
  pushHistory();
  toast('已删除');
}
function duplicateSelection() {
  if (!S.sel.size) return;
  const fresh = [];
  for (const id of S.sel) {
    const n = nodeById(id);
    if (!n) continue;
    const c = JSON.parse(JSON.stringify(n));
    c.id = uid(); c.x += 28; c.y += 28;
    S.nodes.push(c);
    world.appendChild(makeNodeEl(c));
    syncNodeEl(c);
    fresh.push(c.id);
  }
  setSel(fresh);
  pushHistory();
}

/* ============================================================
   粘贴 / 拖放 / 文件选择
   ============================================================ */
function pastePos() {
  const p = toWorld(lastMouse.x, lastMouse.y);
  clearTimeout(pasteTimer);
  pasteCascade++;
  pasteTimer = setTimeout(() => pasteCascade = 0, 1500);
  return { x: p.x + (pasteCascade - 1) * 30, y: p.y + (pasteCascade - 1) * 30 };
}
const IMG_URL_RE = /^https?:\/\/\S+\.(png|jpe?g|gif|webp|svg|avif)(\?\S*)?$/i;

window.addEventListener('paste', e => {
  if (editingId) return;                        // 编辑时走原生粘贴
  const dt = e.clipboardData;
  if (!dt) return;
  const files = [...dt.items].filter(i => i.kind === 'file').map(i => i.getAsFile()).filter(Boolean);
  if (files.length) {
    e.preventDefault();
    dropFiles(files, pastePos());
    return;
  }
  const text = dt.getData('text/plain')?.trim();
  if (text) {
    e.preventDefault();
    const p = pastePos();
    if (IMG_URL_RE.test(text)) addImageURL(text, p);
    else addText(p, text);
  }
});

function dropFiles(files, pos) {
  let i = 0;
  for (const f of files) {
    const p = { x: pos.x + i * 36, y: pos.y + i * 36 };
    if (f.type.startsWith('image/')) addImageBlob(f, p);
    else if (f.type.startsWith('video/')) addVideoBlob(f, p);
    else toast(`暂不支持「${f.type || f.name.split('.').pop()}」文件`);
    i++;
  }
  if (i && files[0]?.type.startsWith('image/')) toast(files.length > 1 ? `已放入 ${files.length} 张图片` : '已放入图片');
  if (i && files[0]?.type.startsWith('video/')) toast('已放入视频');
}

let dragDepth = 0;
window.addEventListener('dragenter', e => {
  if ([...(e.dataTransfer?.types || [])].includes('Files')) { dragDepth++; dropHint.hidden = false; }
});
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('dragleave', e => {
  if (--dragDepth <= 0) { dragDepth = 0; dropHint.hidden = true; }
});
window.addEventListener('drop', e => {
  e.preventDefault();
  dragDepth = 0; dropHint.hidden = true;
  const wp = toWorld(e.clientX, e.clientY);
  const files = [...(e.dataTransfer?.files || [])];
  if (files.length) { dropFiles(files, wp); return; }
  const uri = e.dataTransfer?.getData('text/uri-list')?.split(/\s+/)[0];
  if (uri && /^https?:/.test(uri)) addImageURL(uri, wp);
});

$('#file-image').addEventListener('change', e => {
  dropFiles([...e.target.files], viewportCenterWorld());
  e.target.value = '';
});
$('#file-video').addEventListener('change', e => {
  dropFiles([...e.target.files], viewportCenterWorld());
  e.target.value = '';
});

/* ============================================================
   工具栏 / 缩放栏 / 帮助
   ============================================================ */
function setTool(t) {
  S.tool = t;
  document.body.dataset.tool = t;
  for (const b of document.querySelectorAll('.tool[data-tool]')) b.classList.toggle('active', b.dataset.tool === t);
}
for (const b of document.querySelectorAll('.tool[data-tool]')) b.addEventListener('click', () => setTool(b.dataset.tool));
$('#btn-image').addEventListener('click', () => $('#file-image').click());
$('#btn-video').addEventListener('click', () => $('#file-video').click());
$('#btn-undo').addEventListener('click', undo);
$('#btn-redo').addEventListener('click', redo);
$('#btn-zoom-in').addEventListener('click', () => zoomAt(innerWidth / 2, innerHeight / 2, 1.25));
$('#btn-zoom-out').addEventListener('click', () => zoomAt(innerWidth / 2, innerHeight / 2, 0.8));
$('#zoom-pct').addEventListener('click', () => zoomAbs(innerWidth / 2, innerHeight / 2, 1));
$('#btn-fit').addEventListener('click', fitView);

function openHelp() { helpMask.hidden = false; }
function closeHelp() { helpMask.hidden = true; }
$('#btn-help').addEventListener('click', openHelp);
$('#btn-help-close').addEventListener('click', closeHelp);
helpMask.addEventListener('pointerdown', e => { if (e.target === helpMask) closeHelp(); });

let clearArmed = false;
$('#btn-clear').addEventListener('click', e => {
  const b = e.currentTarget;
  if (!clearArmed) {
    clearArmed = true;
    b.classList.add('arm'); b.textContent = '确认清空？';
    setTimeout(() => { clearArmed = false; b.classList.remove('arm'); b.textContent = '清空画布'; }, 2600);
    return;
  }
  clearArmed = false;
  b.classList.remove('arm'); b.textContent = '清空画布';
  if (editingId) exitEdit(false);
  deleteNodes(S.nodes.map(n => n.id));
  S.cam = { x: innerWidth / 2, y: innerHeight / 2, z: 1 };
  applyCam();
  pushHistory();
  closeHelp();
  toast('画布已清空');
});

let toastTimer = 0;
function toast(msg) {
  toastEl.hidden = false;
  toastEl.textContent = msg;
  toastEl.style.animation = 'none'; toastEl.offsetHeight; toastEl.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.hidden = true, 2200);
}

function updateCounts() {
  statusEl.firstChild.textContent = `节点 ${S.nodes.length} · 连线 ${S.edges.length}`;
  emptyHint.classList.toggle('show', S.nodes.length === 0);
}
const statusEl = $('#statusbar');

/* ============================================================
   双击：编辑文字 / 便签，空白处新建文字
   ============================================================ */
viewport.addEventListener('dblclick', e => {
  const nodeEl = e.target.closest?.('.node');
  if (nodeEl) {
    const n = nodeById(nodeEl.dataset.id);
    if (!n || n.id === editingId) return;
    if (n.type === 'text' || n.type === 'note') startEdit(n);
    else if (n.type === 'video') {
      const v = nodeEls.get(n.id).querySelector('video');
      v.muted = false; v.play().catch(() => { v.muted = true; });
    }
    return;
  }
  if (e.target.classList?.contains('hit')) {
    const id = e.target.parentElement.dataset.id;
    removeEdge(id); pushHistory();
    return;
  }
  if (!spacePan && S.tool !== 'hand') addText(toWorld(e.clientX, e.clientY), '', { edit: true });
});

/* ============================================================
   键盘
   ============================================================ */
window.addEventListener('keydown', e => {
  // 编辑态：只保留 Esc
  if (editingId) {
    if (e.key === 'Escape') { e.preventDefault(); exitEdit(true); }
    return;
  }
  if (helpMask.hidden === false && e.key === 'Escape') { closeHelp(); return; }

  const mod = modKey(e);
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelection(); return; }
  if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); setSel(S.nodes.map(n => n.id)); return; }
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveNow(); return; }

  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); return; }

  if (e.key === ' ') { if (!spacePan) { spacePan = true; document.body.dataset.tool = 'hand'; } e.preventDefault(); return; }

  if (e.key.startsWith('Arrow')) {
    if (!S.sel.size) return;
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
    for (const id of S.sel) { const n = nodeById(id); n.x += dx; n.y += dy; syncNodeEl(n); }
    renderEdges();
    clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(pushHistory, 400);
    return;
  }

  const k = e.key.toLowerCase();
  if (k === 'v') setTool('select');
  else if (k === 'h') setTool('hand');
  else if (k === 't') setTool('text');
  else if (k === 'n') setTool('note');
  else if (e.key === '0') fitView();
  else if (e.key === '1') zoomAbs(innerWidth / 2, innerHeight / 2, 1);
  else if (e.key === '=' || e.key === '+') zoomAt(innerWidth / 2, innerHeight / 2, 1.25);
  else if (e.key === '-') zoomAt(innerWidth / 2, innerHeight / 2, 0.8);
  else if (e.key === '?') helpMask.hidden ? openHelp() : closeHelp();
});
let nudgeTimer = 0;
window.addEventListener('keyup', e => {
  if (e.key === ' ' && spacePan) {
    spacePan = false;
    document.body.dataset.tool = S.tool;
  }
});
window.addEventListener('blur', () => { if (spacePan) { spacePan = false; document.body.dataset.tool = S.tool; } });

/* 编辑失焦自动提交 */
document.addEventListener('focusin', e => {
  if (editingId && !nodeEls.get(editingId)?.contains(e.target)) exitEdit(true);
});

/* ============================================================
   启动示例画布（仅首次，程序生成的渐变艺术图，无外部依赖）
   ============================================================ */
function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function genArt(w, h, seed) {
  const rnd = mulberry32(seed);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const pals = [
    ['#0d0a18', '#43318f', '#c65a7d', '#f0925f', '#ffd166'],
    ['#07151a', '#0f4d5c', '#1fa08c', '#7fd8b2', '#f2f7b6'],
    ['#140b0a', '#6b2432', '#c2453f', '#f08a4b', '#ffe08a'],
  ];
  const pal = pals[seed % pals.length];
  g.fillStyle = pal[0];
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 7; i++) {
    const x = rnd() * w, y = rnd() * h, r = (0.22 + rnd() * 0.5) * Math.max(w, h);
    const col = pal[1 + Math.floor(rnd() * (pal.length - 1))];
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, col + 'b4');
    gr.addColorStop(1, col + '00');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  }
  g.globalCompositeOperation = 'screen';
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.arc(rnd() * w, rnd() * h, (0.12 + rnd() * 0.22) * w, 0, 7);
    g.strokeStyle = `rgba(255,255,255,${0.05 + rnd() * 0.09})`;
    g.lineWidth = 1 + rnd() * 2;
    g.stroke();
  }
  // 颗粒
  const nc = document.createElement('canvas');
  nc.width = nc.height = 140;
  const ng = nc.getContext('2d');
  const im = ng.createImageData(140, 140);
  for (let i = 0; i < im.data.length; i += 4) {
    const v = 90 + rnd() * 90 | 0;
    im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
    im.data[i + 3] = 16;
  }
  ng.putImageData(im, 0, 0);
  g.globalCompositeOperation = 'overlay';
  g.fillStyle = g.createPattern(nc, 'repeat');
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
  return c;
}
const canvasBlob = c => new Promise(res => c.toBlob(res, 'image/jpeg', 0.88));

async function seed() {
  const blobs = await Promise.all([genArt(880, 600, 1), genArt(880, 600, 5)].map(canvasBlob));
  const [a1, a2] = await Promise.all(blobs.map(addAsset));
  const dim1 = await imageSize(assets.get(a1).url);
  const dim2 = await imageSize(assets.get(a2).url);
  const mk = (dim, W) => ({ w: W, h: Math.round(W * dim.h / dim.w) });

  const A = mk(dim1, 440), B = mk(dim2, 440);
  const imgA = { id: uid(), type: 'image', srcKind: 'asset', src: a1, nw: dim1.w, nh: dim1.h, x: -520, y: -60, w: A.w, h: A.h };
  const imgB = { id: uid(), type: 'image', srcKind: 'asset', src: a2, nw: dim2.w, nh: dim2.h, x: 80, y: -60, w: B.w, h: B.h };
  const title = { id: uid(), type: 'text', text: '无限画布', fs: 78, x: -448, y: -300, w: 10, h: 10 };
  const sub = { id: uid(), type: 'text', text: '双击空白写字 · Cmd/Ctrl V 粘贴图片或视频 · 拖动节点边缘的圆点连线', fs: 16, color: 'var(--dim)', mw: 700, x: -450, y: -180, w: 10, h: 10 };
  const note = { id: uid(), type: 'note', text: '把灵感都丢进来\n——\n0 键适应视图\n? 键看快捷键', color: 'var(--note-1)', x: -190, y: 500, w: 250, h: 180 };
  S.nodes.push(imgA, imgB, title, sub, note);
  S.edges.push(
    { id: uid(), a: title.id, b: imgA.id },
    { id: uid(), a: title.id, b: imgB.id },
    { id: uid(), a: imgA.id, b: note.id },
    { id: uid(), a: imgB.id, b: note.id },
  );
  renderAll();
}

/* ============================================================
   启动
   ============================================================ */
(async function boot() {
  gridEl.style.backgroundImage = 'radial-gradient(rgba(240,237,230,.14) 1px, transparent 1.4px)';
  await openDB();
  let snap = await idbGet('kv', 'scene');
  if (typeof snap === 'string') { try { snap = JSON.parse(snap); } catch { snap = null; } }
  if (snap && Array.isArray(snap.nodes)) {
    // 恢复素材 URL
    for (const [k, blob] of await idbAll('assets')) assets.set(k, { url: URL.createObjectURL(blob) });
    S.cam = snap.cam || S.cam;
    S.nodes = snap.nodes;
    S.edges = snap.edges || [];
    renderAll();
    applyCam();
  } else {
    await seed();
    fitView();
  }
  hist = [serialize()]; hi = 0;
  updateUndoUI();
  saveNow();
})();

/* 供无头测试驱动 */
window.IC = {
  S, toWorld, toScreen, fitView, applyCam, zoomAbs,
  addImageBlob, addVideoBlob, addImageURL, addText, addNote, addEdge,
  setSel, serialize, undo, redo, genArt, canvasBlob, addAsset, toast, saveNow,
  nodeById, edgeById: id => S.edges.find(e => e.id === id),
};
