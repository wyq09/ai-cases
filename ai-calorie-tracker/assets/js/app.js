// 应用入口：手机壳 + hash 路由 + 底部导航
import { store } from './store.js';
import { el, icon } from './ui.js';

const view = document.getElementById('view');
const nav = document.getElementById('nav');

// 路由表：hash 前缀 → 页面模块；nav 为需要显示底部导航的 tab
const ROUTES = [
  { match: h => h === '#/onboarding',            file: 'onboarding', nav: null },
  { match: h => h.startsWith('#/recipe/'),       file: 'recipe',     nav: null },
  { match: h => h === '#/scan',                  file: 'scan',       nav: null },
  { match: h => h === '#/dashboard' || h === '' || h === '#/', file: 'dashboard', nav: 'dashboard' },
  { match: h => h === '#/search',                file: 'search',     nav: 'search' },
  { match: h => h === '#/favorites',             file: 'favorites',  nav: 'favorites' },
  { match: h => h === '#/settings',              file: 'settings',   nav: 'settings' },
];

const TABS = [
  { id: 'dashboard', icon: 'home', hash: '#/dashboard' },
  { id: 'search',    icon: 'book', hash: '#/search' },
  { id: 'scan',      icon: 'scan' },
  { id: 'favorites', icon: 'star', hash: '#/favorites' },
  { id: 'settings',  icon: 'gear', hash: '#/settings' },
];

function renderNav(activeId) {
  nav.innerHTML = '';
  for (const t of TABS) {
    if (t.id === 'scan') {
      nav.append(el('button', {
        class: 'nav-scan',
        'aria-label': '拍照识别',
        html: icon('scan', 30, 2),
        onclick: () => { location.hash = '#/scan'; },
      }));
    } else {
      nav.append(el('button', {
        class: 'nav-item' + (t.id === activeId ? ' active' : ''),
        'aria-label': t.id,
        html: icon(t.icon, 25, activeId === t.id ? 2.1 : 1.8),
        onclick: () => { location.hash = t.hash; },
      }));
    }
  }
  nav.classList.toggle('nav-hidden', !activeId);
}

let cleanup = null;
let renderSeq = 0;

async function route() {
  if (!location.hash) {
    location.hash = store.get().onboarded ? '#/dashboard' : '#/onboarding';
    return;
  }
  const def = ROUTES.find(r => r.match(location.hash)) || ROUTES[3];
  const parts = location.hash.replace('#/', '').split('/');
  const seq = ++renderSeq;

  cleanup?.();
  cleanup = null;
  view.scrollTop = 0;
  renderNav(def.nav);

  try {
    const mod = await import(`../js/pages/${def.file}.js`);
    if (seq !== renderSeq) return;            // 已被更新的路由抢占
    view.innerHTML = '';
    cleanup = (await mod.render(view, { arg: parts[1] })) || null;
    view.animate(
      [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }],
      { duration: 260, easing: 'cubic-bezier(.22,1,.32,1)' },
    );
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div style="padding:120px 40px;text-align:center;color:var(--ink-2)">页面加载失败：${err.message}</div>`;
  }
}

// 目标热量变化 → 通知 store 订阅者（页面自行刷新）

// ?reset=1 → 重置演示数据
if (new URLSearchParams(location.search).has('reset')) store.reset();

addEventListener('hashchange', route);
route();
