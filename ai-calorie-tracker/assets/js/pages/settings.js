// 设置页：个人卡 · 设置组（目标热量 / 记录提醒 / 关于 / 清除数据）· 页脚
import { store } from '../store.js';
import { el, icon, sheet, toast } from '../ui.js';

// 行① 弹层：拖动滑杆调整每日目标热量
function openGoalSheet() {
  sheet({
    title: '每日目标热量',
    sub: '调整后仪表盘与百分比会同步更新',
    build(body, close) {
      const num = el('div', { class: 'ex-goal-num' }, String(store.get().goal));
      const range = el('input', {
        class: 'ex-range',
        type: 'range',
        min: '1200',
        max: '3200',
        step: '50',
        value: String(store.get().goal),
        'aria-label': '每日目标热量',
      });
      range.addEventListener('input', () => { num.textContent = range.value; });

      body.append(
        el('div', { class: 'ex-goal-preview' },
          num,
          el('div', { class: 'ex-goal-unit' }, '千卡 / 日'),
        ),
        range,
        el('div', { class: 'ex-range-scale' },
          el('span', {}, '1200'),
          el('span', {}, '3200'),
        ),
        el('button', {
          class: 'btn btn-dark',
          type: 'button',
          style: 'margin-top:16px;',
          onclick() {
            const goal = Number(range.value);
            store.set({ goal });
            close();
            toast(`目标已更新为 ${goal} 千卡`, 'target');
          },
        }, '保存'),
      );
    },
  });
}

// 行③ 弹层：关于
function openAboutSheet() {
  sheet({
    title: '关于',
    build(body, close) {
      body.append(
        el('div', { class: 'ex-about' },
          el('div', { class: 'ex-about-emoji' }, '🍱'),
          el('div', { class: 'ex-about-name' }, '食光 AI'),
          el('div', { class: 'ex-about-ver' }, 'v1.0 · 交互原型'),
          el('p', { class: 'ex-about-desc' },
            '拍照识别食物热量，自动记录每日饮食。本页面为参考设计稿的 1:1 交互复刻，所有数据仅保存在你的浏览器本地。'),
          el('button', {
            class: 'ex-btn-plain',
            type: 'button',
            style: 'margin-top:16px;',
            onclick: close,
          }, '关闭'),
        ),
      );
    },
  });
}

// 行④ 弹层：清除本地数据
function openClearSheet() {
  sheet({
    title: '清除本地数据',
    sub: '将恢复到初始演示状态',
    build(body, close) {
      body.append(
        el('p', { class: 'ex-clear-desc' }, '收藏、饮食记录与目标设置都会被重置，确定继续吗？'),
        el('div', { class: 'ex-btn-row' },
          el('button', { class: 'ex-btn-plain', type: 'button', onclick: close }, '取消'),
          el('button', {
            class: 'ex-btn-danger',
            type: 'button',
            onclick() {
              store.reset();
              close();
              toast('已清除本地数据', 'trash');
              setTimeout(() => { location.hash = '#/onboarding'; }, 600);
            },
          }, '确定清除'),
        ),
      );
    },
  });
}

export function render(view) {
  const s = store.get();
  const page = el('div', { class: 'ex-page' });

  page.append(el('h1', { class: 'ex-h1' }, '设置'));

  // 个人卡
  const userSub = el('p', { class: 'ex-user-sub' },
    `每日目标 ${s.goal} 千卡 · 已记录 ${s.meals.length} 餐`);
  page.append(
    el('section', { class: 'ex-user' },
      el('div', { class: 'ex-avatar' }, '🐻'),
      el('div', {},
        el('div', { class: 'ex-user-name' }, '美食家小艾'),
        userSub,
      ),
    ),
  );

  // 设置组：行工厂（图标格 + label + 右侧元素）
  const group = el('div', { class: 'ex-group' });
  const next = () => el('span', { class: 'ex-next', html: icon('next', 16) });
  const row = ({ ic, label, right = [], danger = false, onTap = null }) => {
    const r = el('div', { class: 'ex-row' + (danger ? ' danger' : '') + (onTap ? ' ex-tap' : '') },
      el('div', { class: 'ex-row-ic', html: icon(ic, 19) }),
      el('div', { class: 'ex-row-label' }, label),
      ...right,
    );
    if (onTap) {
      r.setAttribute('role', 'button');
      r.setAttribute('tabindex', '0');
      r.addEventListener('click', onTap);
      r.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(); }
      });
    }
    group.append(r);
    return r;
  };

  // 行① 每日目标热量
  const goalVal = el('span', { class: 'ex-row-val' }, `${s.goal} 千卡`);
  row({
    ic: 'target',
    label: '每日目标热量',
    right: [el('div', { class: 'ex-row-right' }, goalVal, next())],
    onTap: openGoalSheet,
  });

  // 行② 每日记录提醒（开关）
  const sw = el('button', {
    class: 'switch' + (s.settings.reminder ? ' on' : ''),
    type: 'button',
    role: 'switch',
    'aria-checked': String(!!s.settings.reminder),
    'aria-label': '每日记录提醒',
    onclick() {
      const on = !sw.classList.contains('on');
      sw.classList.toggle('on', on);
      sw.setAttribute('aria-checked', String(on));
      store.set({ settings: { ...store.get().settings, reminder: on } });
      toast(on ? '已开启提醒' : '已关闭提醒', 'bell');
    },
  });
  row({ ic: 'bell', label: '每日记录提醒', right: [sw] });

  // 行③ 关于食光 AI
  row({
    ic: 'book',
    label: '关于食光 AI',
    right: [el('div', { class: 'ex-row-right' }, next())],
    onTap: openAboutSheet,
  });

  // 行④ 清除本地数据（危险色）
  row({ ic: 'trash', label: '清除本地数据', danger: true, onTap: openClearSheet });

  // 目标变化 → 行值 / 个人卡文案实时同步（仪表盘页有自己的订阅，自行刷新）
  const unsub = store.on(st => {
    goalVal.textContent = `${st.goal} 千卡`;
    userSub.textContent = `每日目标 ${st.goal} 千卡 · 已记录 ${st.meals.length} 餐`;
  });

  page.append(
    group,
    el('p', { class: 'ex-foot' }, '食光 AI · 仅为交互原型'),
  );
  view.append(page);
  return unsub;   // 清理函数：路由切换时退订
}
