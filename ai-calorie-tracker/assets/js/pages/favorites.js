// 收藏页：竖版食谱卡 · 点星取消收藏（退场动画）· 空状态
import { RECIPES } from '../data.js';
import { store } from '../store.js';
import { el, icon, toast } from '../ui.js';

const byId = id => RECIPES.find(r => r.id === id);

// 空状态：还没有收藏
function buildEmpty() {
  return el('div', { class: 'ex-empty' },
    el('div', { class: 'ex-empty-ic', html: icon('star', 42) }),
    el('div', { class: 'ex-empty-title' }, '还没有收藏'),
    el('div', { class: 'ex-empty-sub' }, '去食谱页发现好吃的吧'),
    el('button', {
      class: 'btn btn-dark',
      type: 'button',
      onclick: () => { location.hash = '#/search'; },
    }, '逛逛热门食谱'),
  );
}

// 单张收藏竖卡
function buildCard(r, i, onGone) {
  const card = el('article', { class: 'ex-fav-card' });
  card.style.animationDelay = `${i * 60}ms`;   // 入场依次浮现

  const like = el('button', {
    class: 'ex-fav-like',
    type: 'button',
    'aria-label': `取消收藏「${r.name}」`,
    html: icon('star', 18),
    onclick(e) {
      e.stopPropagation();
      if (card.classList.contains('ex-out')) return;   // 防连点
      store.toggleFav(r.id);
      card.classList.add('ex-out');                    // 收拢退场
      toast('已取消收藏', 'star');
      setTimeout(() => { card.remove(); onGone(); }, 270);
    },
  });

  card.addEventListener('click', () => { location.hash = `#/recipe/${r.id}`; });

  card.append(
    el('div', { class: 'ex-fav-media' },
      el('img', { class: 'ex-fav-img', src: r.img, alt: r.name }),
      like,
    ),
    el('div', { class: 'ex-fav-meta' },
      el('h3', { class: 'ex-fav-name' }, r.name),
      el('span', { class: 'ex-fav-kcal' }, `${r.kcal} 千卡`),
    ),
    el('p', { class: 'ex-fav-info' }, `${r.diff} · ${r.minutes} 分钟 · 蛋白质 ${r.p}g`),
  );
  return card;
}

export function render(view) {
  const page = el('div', { class: 'ex-page' });
  const sub = el('p', { class: 'ex-sub' });

  const syncCount = () => { sub.textContent = `${store.get().favorites.length} 个食谱`; };
  syncCount();

  page.append(
    el('h1', { class: 'ex-h1' }, '我的收藏'),
    sub,
  );

  const recipes = store.get().favorites.map(byId).filter(Boolean);

  if (!recipes.length) {
    page.append(buildEmpty());
  } else {
    let list = el('div', { class: 'ex-fav-list' });
    const onGone = () => {
      syncCount();                                   // 收起后更新计数
      if (!store.get().favorites.length) {
        list.replaceWith(buildEmpty());
        list = null;
      }
    };
    recipes.forEach((r, i) => list.append(buildCard(r, i, onGone)));
    page.append(list);
  }

  view.append(page);
}
