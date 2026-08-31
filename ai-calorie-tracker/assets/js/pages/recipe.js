// 食谱详情：头图 + 营养 + 食材 + 做法 + 加入今日饮食
import { RECIPES } from '../data.js';
import { store, nowLabel } from '../store.js';
import { el, icon, sheet, toast } from '../ui.js';

const MEALS = [['早餐', '🌅'], ['午餐', '🌞'], ['晚餐', '🌙'], ['加餐', '🍎']];

export function render(view, { arg }) {
  const r = RECIPES.find(x => x.id === arg);
  if (!r) {
    view.append(el('div', { class: 'rc-page', style: 'padding:120px 40px;text-align:center' },
      el('p', { style: 'font-size:40px' }, '🍽️'),
      el('p', { style: 'font-size:16px;font-weight:800;margin-top:14px' }, '食谱不存在'),
      el('button', {
        class: 'btn btn-dark', style: 'width:auto;padding:0 32px;margin:20px auto 0',
        onclick: () => { location.hash = '#/search'; },
      }, '返回食谱页'),
    ));
    return;
  }

  const favBtn = el('button', { class: 'rc-float', 'aria-label': '收藏', html: icon('star', 20) });
  const paintFav = () => {
    const fav = store.isFav(r.id);
    favBtn.classList.toggle('on', fav);
    favBtn.innerHTML = icon('star', 20, fav ? 0 : 2);
    favBtn.querySelector('svg').setAttribute('fill', fav ? 'currentColor' : 'none');
  };
  favBtn.addEventListener('click', () => {
    const fav = store.toggleFav(r.id);
    paintFav();
    toast(fav ? '已收藏' : '已取消收藏', 'star');
  });
  paintFav();

  const dif = el('span', { class: 'dif' });
  for (let i = 0; i < 4; i++) dif.append(el('i', { class: i < r.level ? 'on' : '' }));

  const panel = el('div', { class: 'rc-panel' },
    el('h1', {}, r.name),
    el('p', { class: 'rc-desc' }, r.desc),
    el('div', { class: 'rc-chips' },
      el('span', { class: 'rc-chip' }, icon('clock', 15, 2), `${r.minutes} 分钟`),
      el('span', { class: 'rc-chip' }, dif, r.diff),
      el('span', { class: 'rc-chip' }, icon('flame', 15, 2), el('b', {}, `${r.kcal} 千卡`)),
    ),
    el('div', { class: 'rc-macros' },
      [['蛋白质', r.p], ['碳水', r.c], ['脂肪', r.f]].map(([k, v]) =>
        el('div', { class: 'rc-macro' }, el('span', { class: 'k' }, k), el('b', {}, `${v}g`))),
    ),
    el('h2', { class: 'rc-h2' }, '食材'),
    el('div', { class: 'rc-ings' },
      r.ingredients.map(([n, amt], i, a) =>
        el('div', { class: 'rc-ing' + (i === a.length - 1 ? ' last' : '') },
          el('span', {}, n), el('span', { class: 'amt' }, amt))),
    ),
    el('h2', { class: 'rc-h2' }, '做法'),
    el('div', { class: 'rc-steps' },
      r.steps.map((s, i) => el('div', { class: 'rc-step' },
        el('span', { class: 'no' }, String(i + 1)),
        el('p', {}, s),
      )),
    ),
    el('div', { style: 'height:20px' }),
    el('button', {
      class: 'btn btn-dark rc-cta',
      onclick: pickMeal,
    }, icon('plus', 18, 2.2), '加入今日饮食'),
  );

  view.append(
    el('img', { class: 'rc-hero', src: r.img, alt: r.name }),
    el('button', {
      class: 'rc-float back', 'aria-label': '返回', style: 'left:20px',
      onclick: () => { location.hash = '#/search'; },
    }, icon('back', 20, 2.2)),
    favBtn,
    panel,
  );

  function pickMeal() {
    sheet({
      title: '选择餐次',
      sub: `「${r.name}」· ${r.kcal} 千卡`,
      build(body, close) {
        const grid = el('div', { class: 'rc-meals' });
        for (const [type, emoji] of MEALS) {
          grid.append(el('button', {
            class: 'rc-meal',
            onclick: () => {
              store.addMeal({
                type, time: nowLabel(),
                kcal: r.kcal, p: r.p, c: r.c, f: r.f,
                name: r.name, img: r.img,
              });
              close();
              toast(`已加入${type} · ${r.name}`);
              setTimeout(() => { location.hash = '#/dashboard'; }, 500);
            },
          },
            el('span', { class: 'e' }, emoji),
            el('span', { class: 't' }, type),
          ));
        }
        body.append(grid);
      },
    });
  }
}
