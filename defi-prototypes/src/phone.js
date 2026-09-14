/* phone.js — iPhone 壳组件：390×844 设计稿，transform 缩放，灵动岛/状态栏/Home条 */
(function () {
'use strict';
const SW = window.SW;

const ICONS = {
  signal: '<svg width="19" height="12" viewBox="0 0 19 12" fill="currentColor"><rect x="0" y="7.5" width="3" height="4.5" rx="1"/><rect x="5" y="5" width="3" height="7" rx="1"/><rect x="10" y="2.5" width="3" height="9.5" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>',
  wifi: '<svg width="17" height="12" viewBox="0 0 17 12" fill="currentColor"><path d="M8.5 12a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4Z"/><path d="M8.5 5.2c1.7 0 3.2.6 4.4 1.7l-1.5 1.6a4.3 4.3 0 0 0-5.8 0L4.1 6.9a6.4 6.4 0 0 1 4.4-1.7Z"/><path d="M8.5.5c2.9 0 5.6 1.1 7.6 3l-1.5 1.5A8.7 8.7 0 0 0 8.5 2.6c-2.4 0-4.6.9-6.1 2.4L.9 3.5c2-1.9 4.7-3 7.6-3Z"/></svg>',
  batt: '<svg width="27" height="13" viewBox="0 0 27 13" fill="none"><rect x="0.5" y="0.5" width="23" height="12" rx="3.5" stroke="currentColor" opacity=".45"/><rect x="2" y="2" width="20" height="9" rx="2.2" fill="currentColor"/><path d="M25.5 4.5v4a2.2 2.2 0 0 0 0-4Z" fill="currentColor" opacity=".45"/></svg>'
};

/**
 * 创建一台 iPhone。
 * opts: { scale, status:'light'|'dark', screenBg, name, num, title }
 * 返回 { wrap, root, screen, scroll }
 */
SW.phone = function (opts) {
  opts = opts || {};
  const scale = opts.scale || (window.innerWidth < 780
    ? Math.max(0.42, Math.min(0.8, (window.innerWidth - 46) / 390))
    : 0.8);
  const wrap = document.createElement('div');
  wrap.className = 'ph-wrap';
  wrap.style.width = (390 * scale) + 'px';
  wrap.style.height = (844 * scale) + 'px';

  const root = document.createElement('div');
  root.className = 'phone';
  root.dataset.status = opts.status || 'light';
  if (opts.name) root.dataset.phone = opts.name;
  root.style.transform = 'scale(' + scale + ')';

  root.innerHTML =
    '<div class="island"></div>' +
    '<div class="screen">' +
      '<div class="sbar"><span class="stime">9:41</span><span class="sicons">' + ICONS.signal + ICONS.wifi + ICONS.batt + '</span></div>' +
      '<div class="scroll"></div>' +
      '<div class="homebar"></div>' +
    '</div>';

  wrap.appendChild(root);

  const screen = root.querySelector('.screen');
  const scroll = root.querySelector('.scroll');
  if (opts.screenBg) screen.style.background = opts.screenBg;

  // 注册到全屏观看器
  if (opts.name && SW._registerPhone) {
    SW._registerPhone({ name: opts.name, num: opts.num, title: opts.title, root, wrap, scale });
  }
  return { wrap, root, screen, scroll, scale };
};

/* 便捷：把内容节点放进滚动区 */
SW.phoneFill = function (p, el) { p.scroll.appendChild(el); return el; };
})();
