// 搜索 / 食谱主页：搜索过滤 + 分类筛选 + 热门食谱轮播
import { CATS, RECIPES } from '../data.js';
import { store } from '../store.js';
import { el, icon, toast, openNotifications } from '../ui.js';

function starBtn(r, onUpdate) {
  const paint = () => {
    const fav = store.isFav(r.id);
    b.style.color = fav ? 'var(--orange)' : '#D8D1C0';
    b.innerHTML = icon('star', 24, fav ? 0 : 1.8);
    b.querySelector('svg').setAttribute('fill', fav ? 'currentColor' : 'none');
  };
  const b = el('button', {
    class: 'se-star', 'aria-label': '收藏',
    onclick: e => {
      e.stopPropagation();
      const fav = store.toggleFav(r.id);
      paint(); onUpdate?.();
      toast(fav ? '已收藏' : '已取消收藏', 'star');
    },
  });
  paint();
  return b;
}

// 大卡：参考稿中的热门食谱卡
function card(r, wide, onUpdate) {
  const dif = el('span', { class: 'dif' });
  for (let i = 0; i < 4; i++) dif.append(el('i', { class: i < r.level ? 'on' : '' }));
  const c = el('article', { class: 'se-card' + (wide ? ' wide' : '') },
    el('div', { class: 'se-card-top' },
      el('h3', {}, r.name),
      starBtn(r, onUpdate),
    ),
    el('div', { class: 'se-time' }, icon('clock', 14, 2), ` ${r.minutes} 分钟`),
    el('img', { class: 'se-img', src: r.img, alt: r.name, loading: 'lazy' }),
    el('div', { class: 'se-foot' },
      el('span', { class: 'se-diff' }, r.diff), dif,
      el('span', { class: 'se-kcal' }, el('b', {}, String(r.kcal)), ' 千卡'),
    ),
  );
  c.addEventListener('click', () => { location.hash = `#/recipe/${r.id}`; });
  return c;
}

export function render(view) {
  const st = { cat: 'all', expanded: false, q: '' };

  const input = el('input', { type: 'search', placeholder: '搜索食谱或食物', 'aria-label': '搜索' });
  const bell = el('button', { class: 'icon-btn', 'aria-label': '通知', html: icon('bell', 20) },
    el('span', { class: 'dot' }));
  bell.addEventListener('click', openNotifications);

  const catsRow = el('div', { class: 'se-cats' });
  const secTitle = el('div', { class: 'sec' },
    el('h2', {}, '热门食谱'),
    el('span', { class: 'badge se-count' }),
    el('button', { class: 'more se-more' }, '查看全部'),
  );
  const content = el('div', {});
  const metaLine = el('p', { class: 'se-meta', style: 'display:none' });

  const byCat = r => st.cat === 'all' ? true
    : st.cat === 'low' ? r.kcal <= 420
    : r.tags.includes(st.cat);

  function renderContent() {
    content.innerHTML = '';
    metaLine.style.display = 'none';

    if (st.q) {                                    // 搜索结果列表
      const list = RECIPES.filter(r => r.name.includes(st.q) || r.desc.includes(st.q));
      metaLine.style.display = 'block';
      metaLine.textContent = `找到 ${list.length} 个结果`;
      secTitle.style.display = 'none';
      if (!list.length) {
        content.append(el('div', { class: 'se-empty' },
          el('div', { class: 'se-empty-emoji' }, '🔍'),
          el('p', { class: 'se-empty-t' }, '没有找到相关食谱'),
          el('p', { class: 'se-empty-s' }, '换个关键词试试，比如「碗」「咖喱」'),
        ));
        return;
      }
      const l = el('div', { class: 'se-list' });
      list.forEach((r, i) => { const c = card(r, true); c.style.animationDelay = `${i * 50}ms`; l.append(c); });
      content.append(l);
      return;
    }

    secTitle.style.display = '';
    const list = RECIPES.filter(byCat);
    content.querySelector('.se-count');
    secTitle.querySelector('.se-count').textContent = list.length;

    if (st.expanded) {
      const l = el('div', { class: 'se-list' });
      list.forEach((r, i) => { const c = card(r, true); c.style.animationDelay = `${i * 50}ms`; l.append(c); });
      content.append(l);
    } else {
      const row = el('div', { class: 'se-row' });
      list.forEach(r => row.append(card(r, false)));
      content.append(row);
      if (!list.length) {
        content.append(el('div', { class: 'se-empty' },
          el('div', { class: 'se-empty-emoji' }, '🥗'),
          el('p', { class: 'se-empty-t' }, '该分类下暂无食谱'),
        ));
      }
    }
  }

  // 分类
  function renderCats() {
    catsRow.innerHTML = '';
    for (const cat of CATS) {
      const item = el('button', { class: 'se-cat' + (cat.id === st.cat ? ' on' : '') },
        el('span', { class: 'se-cat-ico' }, cat.emoji),
        el('span', { class: 'se-cat-label' }, cat.label),
      );
      item.addEventListener('click', () => { st.cat = cat.id; renderCats(); renderContent(); });
      catsRow.append(item);
    }
  }

  secTitle.querySelector('.se-more').addEventListener('click', () => {
    st.expanded = !st.expanded;
    secTitle.querySelector('.se-more').textContent = st.expanded ? '收起' : '查看全部';
    renderContent();
  });
  input.addEventListener('input', () => { st.q = input.value.trim(); renderContent(); });

  renderCats();
  renderContent();

  view.append(el('div', { class: 'se-page' },
    el('div', { class: 'se-top' },
      el('div', { class: 'se-search' }, icon('search', 18, 2), input),
      bell,
    ),
    catsRow,
    el('div', { class: 'se-section' }, secTitle, metaLine),
    content,
  ));
}
