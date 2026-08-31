// UI 公共元件：dom 构建 / SVG 图标 / 底部弹层 / Toast / 通知中心

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'style') node.style.cssText = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null) continue;
    if (typeof c === 'string' && c.includes('<')) {
      // 含标签的字符串按 HTML 解析（如 icon() 返回的 SVG）
      const t = document.createElement('template');
      t.innerHTML = c.trim();
      node.append(t.content);
    } else {
      node.append(c.nodeType ? c : document.createTextNode(c));
    }
  }
  return node;
}

// ---- 线性图标（stroke 风格，颜色随 currentColor） ----
const P = {
  calendar: '<rect x="3.5" y="5" width="17" height="16" rx="4"/><path d="M3.5 10h17M8 2.8v4M16 2.8v4M8 14.5h2M8 18h6"/>',
  bell: '<path d="M18 9.5a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6M10 19a2.2 2.2 0 0 0 4 0"/>',
  home: '<path d="M4 10.5 12 3.5l8 7v8.5a1.8 1.8 0 0 1-1.8 1.8H15v-6.4H9v6.4H5.8A1.8 1.8 0 0 1 4 19z"/>',
  book: '<path d="M5 4.5h6a3 3 0 0 1 3 3V21a2.6 2.6 0 0 0-2.6-2H5zM20 4.5h-6v13.9A2.6 2.6 0 0 1 19 21h1z"/>',
  scan: '<path d="M4 8V6.5A2.5 2.5 0 0 1 6.5 4H8M16 4h1.5A2.5 2.5 0 0 1 20 6.5V8M20 16v1.5a2.5 2.5 0 0 1-2.5 2.5H16M8 20H6.5A2.5 2.5 0 0 1 4 17.5V16"/><circle cx="12" cy="12" r="3.2"/>',
  star: '<path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.7l5.8-.8z"/>',
  gear: '<circle cx="12" cy="12" r="3.4"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.04.05a2 2 0 1 1-2.83 2.83l-.05-.05a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.05.04a2 2 0 1 1-2.83-2.83l.05-.05a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 8.9a1.7 1.7 0 0 0-.34-1.87l-.04-.05a2 2 0 1 1 2.83-2.83l.05.05a1.7 1.7 0 0 0 1.87.34h.08A1.7 1.7 0 0 0 10.13 3V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.05-.04a2 2 0 1 1 2.83 2.83l-.05.05a1.7 1.7 0 0 0-.34 1.87v.08a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.03z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  pencil: '<path d="M17 3.7a2.4 2.4 0 0 1 3.4 3.4L8 19.5l-4.5 1 1-4.5z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/>',
  back: '<path d="m14.5 5.5-7 6.5 7 6.5"/>',
  next: '<path d="m9.5 5.5 7 6.5-7 6.5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  camera: '<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.3-2h5.2l1.3 2h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.4"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="3.5"/><circle cx="9" cy="9.5" r="1.6"/><path d="m5 18 4.5-4.5 3 3L16 13l3.5 3.5"/>',
  zap: '<path d="M13 2.5 4.5 13.5h6L11 21.5l8.5-11h-6z"/>',
  flame: '<path d="M12 3s5.5 4.2 5.5 9.5a5.5 5.5 0 0 1-11 0C6.5 8 12 3 12 3z"/><path d="M12 21a3 3 0 0 1-3-3c0-2 3-4.5 3-4.5s3 2.5 3 4.5a3 3 0 0 1-3 3z"/>',
  trash: '<path d="M4.5 7h15M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2M6.5 7l1 12.2A1.8 1.8 0 0 0 9.3 21h5.4a1.8 1.8 0 0 0 1.8-1.8L17.5 7"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
};

export function icon(name, size = 24, sw = 1.8) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`;
}

// ---- 底部弹层（同一时刻只保留一个） ----
let sheetClose = null;

export function sheet({ title = '', sub = '', build, onclose }) {
  closeSheet(true);
  const root = document.getElementById('sheet-root');
  const body = el('div', { class: 'sheet-body' });
  const overlay = el('div', { class: 'sheet-overlay' });
  const box = el('div', { class: 'sheet' },
    el('div', { class: 'grabber' }),
    title && el('h3', {}, title),
    sub && el('p', { class: 'sub' }, sub),
    body,
  );
  root.append(overlay, box);
  const close = () => {
    overlay.classList.remove('show');
    box.classList.remove('show');
    setTimeout(() => { overlay.remove(); box.remove(); }, 380);
    if (sheetClose === close) sheetClose = null;
    onclose?.();
  };
  overlay.addEventListener('click', close);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    overlay.classList.add('show');
    box.classList.add('show');
  }));
  build?.(body, close);
  sheetClose = close;
  return close;
}

export function closeSheet(instant = false) {
  if (sheetClose) instant ? sheetClose() : sheetClose();
}

// ---- Toast ----
let toastTimer = null;
export function toast(msg, ic = 'check') {
  const root = document.getElementById('toast-root');
  root.innerHTML = '';
  const t = el('div', { class: 'toast' });
  t.innerHTML = icon(ic, 18) + `<span>${msg}</span>`;
  root.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 2100);
}

// ---- 通知中心（仪表盘 / 搜索页铃铛共用） ----
export function openNotifications() {
  import('./store.js').then(({ store }) => {
    const list = store.get().notifications;
    sheet({
      title: '通知',
      sub: `共 ${list.length} 条新消息`,
      build(body, close) {
        const wrap = el('div', { style: 'display:flex;flex-direction:column;gap:10px;' });
        for (const n of list) {
          wrap.append(el('div', {
            class: 'notif-item',
            style: 'display:flex;gap:12px;align-items:flex-start;background:var(--paper);border-radius:18px;padding:14px;',
          },
            el('div', {
              style: 'width:38px;height:38px;border-radius:13px;background:var(--orange-bg);color:var(--orange);display:flex;align-items:center;justify-content:center;flex:none;',
              html: icon(n.icon, 20),
            }),
            el('div', {},
              el('div', { style: 'font-size:14px;font-weight:700;' }, n.title),
              el('div', { style: 'font-size:12.5px;color:var(--ink-2);margin-top:2px;' }, n.desc),
            ),
            el('div', { style: 'margin-left:auto;font-size:11px;color:var(--ink-3);flex:none;' }, n.time),
          ));
        }
        body.append(wrap);
      },
    });
  });
}
