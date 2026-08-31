// 仪表盘页（应用主页）：弧形卡路里仪表 + 添加/编辑记录 + 本周概览
import { store, nowLabel } from '../store.js';
import { el, icon, sheet, toast, openNotifications } from '../ui.js';
import { QUICK_FOODS } from '../data.js';

/* ---------- 弧形仪表几何：12 段圆弧，150° 顺时针扫至 -60°（每段 14.5°，留 3° 缺口） ---------- */
const CX = 170, CY = 170, R = 110;
const SEG_COUNT = 12, START = 150, STEP = 17.5, SWEEP = 14.5;
const rad = d => (d * Math.PI) / 180;
const pt = a =>
  `${(CX + R * Math.cos(rad(a))).toFixed(2)} ${(CY - R * Math.sin(rad(a))).toFixed(2)}`;
const segPath = i => {
  const a0 = START - i * STEP;
  return `M ${pt(a0)} A ${R} ${R} 0 0 1 ${pt(a0 - SWEEP)}`;
};

// 已填充段颜色：沿弧从浅到深插值 #F9CBA2 → #ED8246
const C_FROM = [0xf9, 0xcb, 0xa2], C_TO = [0xed, 0x82, 0x46];
function fillColor(j, filled) {
  const t = filled <= 1 ? 0 : j / (filled - 1);
  const c = C_FROM.map((v, i) => Math.round(v + (C_TO[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// 卡片标题统一为餐次名；有食物名时（扫描/食谱添加）并入副标题
const displayName = m => m.type;
const subLabel = m => (m.name ? `${m.name} · ${m.time}` : m.time);

export function render(view) {
  /* ---------- 顶栏 ---------- */
  const top = el('div', { class: 'db-top' },
    el('button', { class: 'icon-btn', 'aria-label': '本周概览', html: icon('calendar', 20), onclick: () => openWeek() }),
    el('h1', { class: 'db-title' }, '仪表盘'),
    el('button', { class: 'icon-btn', 'aria-label': '通知', html: icon('bell', 20) + '<i class="dot"></i>', onclick: openNotifications }),
  );

  /* ---------- 弧形卡路里仪表 ---------- */
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 340 300');
  svg.setAttribute('aria-hidden', 'true');
  const segs = [];
  for (let i = 0; i < SEG_COUNT; i++) {
    const p = document.createElementNS(svg.namespaceURI, 'path');
    p.setAttribute('d', segPath(i));
    p.setAttribute('class', 'db-seg');
    p.style.transitionDelay = `${i * 45}ms`;
    svg.append(p);
    segs.push(p);
  }

  const numEl = el('b', {}, '0');
  const goalEl = el('p', { class: 'db-goal' });
  const center = el('div', { class: 'db-center' },
    el('span', { class: 'db-zap', html: icon('zap', 18) }),
    el('p', { class: 'db-date' }, `${new Date().getMonth() + 1}月${new Date().getDate()}日`),
    el('div', { class: 'db-num' }, numEl, el('span', {}, '千卡')),
    goalEl,
  );
  const gauge = el('div', { class: 'db-gauge' }, svg, center);

  /* ---------- 「+」添加条 / 进度提示条 ---------- */
  const addBar = el('button', { class: 'db-add', 'aria-label': '添加记录', html: icon('plus', 22), onclick: () => openAdd() });
  const tipText = el('p', {});
  const tip = el('div', { class: 'db-tip' }, el('span', { class: 'db-tip-ic', html: icon('flame', 18) }), tipText);

  /* ---------- 餐次卡片列表 ---------- */
  const list = el('div', { class: 'db-list' });

  view.append(el('div', { class: 'db-page' }, top, gauge, addBar, tip, list));

  /* ---------- 动态渲染 ---------- */
  let shown = 0, numRaf = 0;

  // 主数字 count-up（600ms ease-out）
  function countTo(target) {
    cancelAnimationFrame(numRaf);
    const from = shown, t0 = performance.now(), dur = 600;
    const tick = now => {
      const k = Math.min(1, (now - t0) / dur);
      shown = Math.round(from + (target - from) * (1 - (1 - k) ** 3));
      numEl.textContent = shown;
      if (k < 1) numRaf = requestAnimationFrame(tick);
    };
    numRaf = requestAnimationFrame(tick);
  }

  function paintGauge() {
    const filled = Math.round(store.pct() * SEG_COUNT);
    segs.forEach((p, i) => { p.style.stroke = i < filled ? fillColor(i, filled) : ''; });
  }

  function updateTip() {
    const { goal } = store.get(), total = store.total();
    tipText.textContent = total < goal
      ? `还差 ${goal - total} 千卡达标，晚餐记得均衡搭配`
      : '太棒了，今日目标已达成 🎉';
    goalEl.textContent = `目标 ${goal} 千卡`;
  }

  const macro = (k, v) => el('div', { class: 'macro' }, el('div', { class: 'k' }, k), el('div', { class: 'v' }, `${v}g`));

  function mealCard(m, i) {
    const pct = Math.round((m.kcal / store.get().goal) * 100);
    const media = m.img
      ? el('img', { class: 'db-meal-img', src: m.img, alt: displayName(m) })
      : el('div', { class: 'db-meal-emoji' }, m.emoji || '🍽️');
    return el('article', { class: 'db-card', style: `animation-delay:${i * 70}ms` },
      el('div', { class: 'db-card-top' },
        media,
        el('div', { class: 'db-card-info' },
          el('h3', {}, displayName(m)),
          el('p', {}, subLabel(m))),
        el('div', { class: 'db-card-kcal' },
          el('div', { class: 'db-card-num' }, el('b', {}, String(m.kcal)), el('span', {}, '千卡')),
          el('p', {}, `占目标 ${pct}%`))),
      el('div', { class: 'db-card-macros' },
        el('div', { class: 'macro-row' },
          macro('蛋白质', m.p), macro('碳水', m.c), macro('脂肪', m.f)),
        el('button', { class: 'db-edit', 'aria-label': '编辑记录', html: icon('pencil', 16), onclick: () => openEdit(m) })),
    );
  }

  function renderList() {
    const meals = store.get().meals;
    list.innerHTML = '';
    if (!meals.length) {
      list.append(el('div', { class: 'db-empty' },
        el('div', { class: 'db-empty-em' }, '📷'),
        el('h3', {}, '今天还没有记录'),
        el('p', {}, '拍一张，AI 帮你自动记录'),
        el('button', { class: 'btn btn-orange db-empty-btn', onclick: () => { location.hash = '#/scan'; } }, '拍照识别'),
      ));
      return;
    }
    meals.forEach((m, i) => list.append(mealCard(m, i)));
  }

  function refresh() {
    paintGauge();
    countTo(store.total());
    updateTip();
    renderList();
  }

  /* ---------- 弹层：添加记录 ---------- */
  function openAdd() {
    sheet({
      title: '添加记录',
      sub: '选择一种记录方式',
      build(body, close) {
        const entry = (ic, title, desc, hash) => el('button', {
          class: 'db-entry',
          onclick: () => { close(); location.hash = hash; },
        },
          el('span', { class: 'db-entry-ic', html: icon(ic, 20) }),
          el('span', { class: 'db-entry-tx' }, el('b', {}, title), el('span', {}, desc)),
          el('span', { class: 'db-entry-next', html: icon('next', 16) }),
        );
        body.append(
          el('div', { class: 'db-entries' },
            entry('camera', '拍照识别', 'AI 自动识别热量与营养', '#/scan'),
            entry('search', '搜索食谱', '从热门食谱中添加', '#/search')),
          el('p', { class: 'db-quick-title' }, '快速添加'),
          el('div', { class: 'db-quick' }, QUICK_FOODS.map(it => el('button', {
            class: 'db-quick-item',
            onclick: () => {
              store.addMeal({ type: '加餐', time: nowLabel(), kcal: it.kcal, p: 0, c: 0, f: 0, name: it.name, emoji: it.emoji });
              close();
              toast(`已记录「${it.name} · ${it.kcal} 千卡」`);
            },
          },
            el('span', { class: 'em' }, it.emoji),
            el('b', {}, it.name),
            el('span', { class: 'kc' }, `${it.kcal} 千卡`),
          ))),
        );
      },
    });
  }

  /* ---------- 弹层：本周概览 ---------- */
  function openWeek() {
    const days = ['一', '二', '三', '四', '五', '六', '日'];
    const vals = [58, 74, 42, 88, 66, 35, Math.round(store.pct() * 100)];
    sheet({
      title: '本周概览',
      build(body) {
        body.append(
          el('div', { class: 'db-week' }, vals.map((h, i) =>
            el('div', { class: 'db-week-col' + (i === 6 ? ' today' : '') },
              el('div', { class: 'db-week-track' },
                el('i', { class: 'db-week-bar', style: `height:${h}%;animation-delay:${i * 40}ms` })),
              el('span', { class: 'db-week-day' }, days[i]),
            ))),
          el('p', { class: 'db-week-sum' }, `日均约 1,420 千卡 · 目标 ${store.get().goal} 千卡`),
        );
      },
    });
  }

  /* ---------- 弹层：编辑记录 ---------- */
  function openEdit(m) {
    const base = { kcal: m.kcal, p: m.p, c: m.c, f: m.f };
    let n = 1;
    const scaled = () => ({
      kcal: Math.round(base.kcal * n),
      p: Math.round(base.p * n),
      c: Math.round(base.c * n),
      f: Math.round(base.f * n),
    });
    sheet({
      title: '编辑记录',
      sub: `${m.type} · ${m.time}`,
      build(body, close) {
        const nEl = el('b', {}, '1 份');
        const kcalEl = el('b', {}, base.kcal);
        const pEl = el('b', {}, `${base.p}g`);
        const cEl = el('b', {}, `${base.c}g`);
        const fEl = el('b', {}, `${base.f}g`);
        const refreshPreview = () => {
          const s = scaled();
          nEl.textContent = `${n} 份`;
          kcalEl.textContent = s.kcal;
          pEl.textContent = `${s.p}g`;
          cEl.textContent = `${s.c}g`;
          fEl.textContent = `${s.f}g`;
        };
        const step = d => { n = Math.min(20, Math.max(1, n + d)); refreshPreview(); };
        const prevItem = (label, node) => el('div', { class: 'db-prev-item' }, el('i', {}, label), node);
        body.append(
          el('div', { class: 'db-edit-row' },
            el('span', { class: 'db-edit-label' }, '份量'),
            el('div', { class: 'stepper' },
              el('button', { 'aria-label': '减少份量', html: icon('minus', 18), onclick: () => step(-1) }),
              nEl,
              el('button', { 'aria-label': '增加份量', html: icon('plus', 18), onclick: () => step(1) }),
            )),
          el('div', { class: 'db-edit-preview' },
            el('div', { class: 'db-prev-kcal' }, kcalEl, el('span', {}, '千卡')),
            el('div', { class: 'db-prev-macros' },
              prevItem('蛋白质', pEl), prevItem('碳水', cEl), prevItem('脂肪', fEl))),
          el('div', { class: 'db-edit-actions' },
            el('button', {
              class: 'db-del', html: `${icon('trash', 16)}<span>删除记录</span>`,
              onclick: () => { store.removeMeal(m.id); close(); toast('已删除记录'); },
            }),
            el('button', {
              class: 'btn btn-dark db-save',
              onclick: () => { store.updateMeal(m.id, scaled()); close(); toast('已更新'); },
            }, '保存')),
        );
        refreshPreview();
      },
    });
  }

  /* ---------- 初始化 & 实时订阅 ---------- */
  updateTip();
  renderList();
  countTo(store.total());
  let raf1 = 0, raf2 = 0;
  raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(paintGauge); });

  const unsub = store.on(refresh);
  return () => {
    unsub();
    cancelAnimationFrame(numRaf);
    cancelAnimationFrame(raf1);
    cancelAnimationFrame(raf2);
  };
}
