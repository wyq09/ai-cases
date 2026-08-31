// 扫描识别页：深色取景 + 模拟 AI 识别流程 + 结果弹层入库
import { SCAN_POOL } from '../data.js';
import { store, nowLabel } from '../store.js';
import { el, icon, sheet, toast } from '../ui.js';

let scanCount = 0; // 模块级：跨路由记忆当前候选，从 0 起

const HINT = '对准食物，自动识别热量与营养';
const STEPS = ['正在检测食物…', '匹配营养数据库…', '估算份量…'];
const candidate = () => SCAN_POOL[scanCount % SCAN_POOL.length];

export function render(view, params) {
  const timers = new Set();
  const later = (fn, ms) => {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
    return id;
  };

  let busy = false; // 识别进行中锁

  // ---- 取景框 ----
  const photo = el('img', { class: 'sc-photo', src: candidate().img, alt: '取景预览', draggable: 'false' });
  const flash = el('div', { class: 'sc-flash' });
  const viewer = el('div', { class: 'sc-viewer' },
    photo,
    el('div', { class: 'sc-vignette' }),
    el('span', { class: 'sc-corner tl' }),
    el('span', { class: 'sc-corner tr' }),
    el('span', { class: 'sc-corner bl' }),
    el('span', { class: 'sc-corner br' }),
    el('div', { class: 'sc-line' }),
    flash,
  );

  const status = el('p', { class: 'sc-status' }, HINT);

  function setStatus(text) {
    status.style.opacity = '0';
    later(() => { status.textContent = text; status.style.opacity = '1'; }, 150);
  }

  // 候选切换：旧图瞬间隐去，新图 300ms 淡入
  function swapPhoto() {
    photo.classList.remove('sc-fade');
    photo.style.opacity = '0';
    later(() => {
      photo.src = candidate().img;
      photo.classList.add('sc-fade');
      photo.style.opacity = '1';
    }, 60);
  }

  // ---- 顶栏 ----
  const top = el('div', { class: 'sc-top' },
    el('button', { class: 'icon-btn sc-ibtn', 'aria-label': '返回', html: icon('close', 20, 2.2), onclick: () => history.back() }),
    el('div', { class: 'sc-title' }, '拍照识别'),
    el('button', { class: 'icon-btn sc-ibtn', 'aria-label': '从相册识别', html: icon('image', 20, 1.9), onclick: () => recognize() }),
  );

  // ---- 底部操作区 ----
  function nextFood() {
    if (busy) return;
    scanCount++;
    swapPhoto();
    toast('已切换示例食物', 'image');
  }

  const actions = el('div', { class: 'sc-actions' },
    el('button', { class: 'sc-side', 'aria-label': '从相册识别', html: icon('image', 22, 1.9), onclick: () => recognize() }),
    el('button', { class: 'sc-shutter', 'aria-label': '拍照识别', onclick: () => recognize() },
      el('span', { class: 'sc-shutter-core' })),
    el('button', { class: 'sc-side', title: '换个食物', 'aria-label': '换个食物', html: icon('zap', 22, 2), onclick: nextFood }),
  );

  const page = el('div', { class: 'sc-page' }, top, viewer, status, actions);
  view.append(page);

  // ---- 识别流程（约 1.9s） ----
  function recognize() {
    if (busy) return;
    busy = true;
    page.classList.add('sc-busy');
    viewer.classList.add('sc-fast');

    flash.classList.remove('sc-on');
    void flash.offsetWidth; // 重置动画
    flash.classList.add('sc-on');
    later(() => flash.classList.remove('sc-on'), 560);

    setStatus(STEPS[0]);
    later(() => setStatus(STEPS[1]), 620);
    later(() => setStatus(STEPS[2]), 1240);
    later(finish, 1880);
  }

  function finish() {
    busy = false;
    page.classList.remove('sc-busy');
    viewer.classList.remove('sc-fast');

    const c = candidate();     // 与当前取景框一致；弹层关闭后才切换下一个
    status.textContent = HINT;
    status.style.opacity = '1';
    openResult(c);
  }

  // ---- 结果弹层 ----
  // 按时刻推测餐次：10:30–11:45、14:30–17:30、21 点后视为加餐时段
  const bucket = () => {
    const d = new Date();
    const hm = d.getHours() + d.getMinutes() / 60;
    if (hm < 10.5) return '早餐';
    if (hm < 11.75) return '加餐';
    if (hm < 14.5) return '午餐';
    if (hm < 17.5) return '加餐';
    if (hm < 21) return '晚餐';
    return '加餐';
  };

  function openResult(c) {
    const base = { kcal: c.kcal, p: c.p, c: c.c, f: c.f };
    let n = 1;
    let mealType = bucket();

    const kcalV = el('b', { class: 'sc-kcal' }, String(c.kcal));
    const pV = el('b', { class: 'sc-macro-v' }, `${c.p}g`);
    const cV = el('b', { class: 'sc-macro-v' }, `${c.c}g`);
    const fV = el('b', { class: 'sc-macro-v' }, `${c.f}g`);
    const nLabel = el('b', {}, `${n} 份`);

    const apply = () => { // 份数变化 → 按打开时基准 × n 实时刷新
      kcalV.textContent = Math.round(base.kcal * n);
      pV.textContent = `${Math.round(base.p * n)}g`;
      cV.textContent = `${Math.round(base.c * n)}g`;
      fV.textContent = `${Math.round(base.f * n)}g`;
      nLabel.textContent = `${n} 份`;
    };

    sheet({
      title: '识别结果',
      sub: `置信度 ${c.conf}% · AI 估算仅供参考`,
      onclose() {
        scanCount++;   // 结果弹层关闭 → 取景框换下一个候选
        swapPhoto();
      },
      build(body, close) {
        body.append(
          el('div', { class: 'sc-res' },
            el('img', { class: 'sc-res-img', src: c.img, alt: c.name }),
            el('div', {},
              el('div', { class: 'sc-res-name' }, c.name),
              el('div', { class: 'sc-res-conf' },
                el('span', { html: icon('check', 14, 2.6) }),
                '匹配度较高',
              ),
            ),
          ),
          el('div', { class: 'sc-kcal-row' },
            el('span', { class: 'sc-kcal-label' }, '预计热量'),
            el('div', { class: 'sc-kcal-right' }, kcalV, el('span', { class: 'sc-kcal-unit' }, '千卡')),
          ),
          el('div', { class: 'sc-macros' },
            el('div', { class: 'sc-macro' }, pV, el('span', { class: 'sc-macro-k' }, '蛋白质')),
            el('div', { class: 'sc-macro' }, cV, el('span', { class: 'sc-macro-k' }, '碳水')),
            el('div', { class: 'sc-macro' }, fV, el('span', { class: 'sc-macro-k' }, '脂肪')),
          ),
          el('div', { class: 'sc-step-row' },
            el('div', { class: 'stepper' },
              el('button', { 'aria-label': '减少份量', html: icon('minus', 16, 2.2), onclick: () => { if (n > 1) { n--; apply(); } } }),
              nLabel,
              el('button', { 'aria-label': '增加份量', html: icon('plus', 16, 2.2), onclick: () => { if (n < 9) { n++; apply(); } } }),
            ),
          ),
          el('div', { class: 'sc-meal-chips' },
            ['早餐', '午餐', '晚餐', '加餐'].map(t =>
              el('button', {
                class: 'sc-meal-chip' + (t === mealType ? ' on' : ''),
                onclick(e) {
                  mealType = t;
                  e.currentTarget.parentElement.querySelectorAll('.sc-meal-chip').forEach(x => x.classList.remove('on'));
                  e.currentTarget.classList.add('on');
                },
              }, t)),
          ),
          el('button', {
            class: 'btn btn-orange sc-add',
            onclick() {
              store.addMeal({
                type: mealType,
                time: nowLabel(),
                kcal: Math.round(base.kcal * n),
                p: Math.round(base.p * n),
                c: Math.round(base.c * n),
                f: Math.round(base.f * n),
                name: c.name,
                img: c.img,
              });
              close();
              toast(`记录成功 · ${c.name}`, 'check');
              later(() => { location.hash = '#/dashboard'; }, 420);
            },
          }, '添加到今日饮食'),
        );
      },
    });
  }

  // 清理：所有 setTimeout / 动画句柄
  return () => {
    for (const id of timers) clearTimeout(id);
    timers.clear();
    busy = false;
  };
}
