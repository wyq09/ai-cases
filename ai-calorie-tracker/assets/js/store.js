// 集中状态：localStorage 持久化 + 发布订阅
const KEY = 'shiguang-ai-v1';

function defaults() {
  return {
    onboarded: false,
    goal: 2000,
    meals: [
      { id: 'm-breakfast', type: '早餐', time: '上午 11:30', kcal: 500, p: 36, c: 57, f: 14, img: 'assets/img/avocado-toast.jpg' },
      { id: 'm-lunch',     type: '午餐', time: '下午 2:30',  kcal: 693, p: 48, c: 83, f: 25, img: 'assets/img/quinoa-bowl.jpg' },
    ],
    favorites: ['r1', 'r3'],
    notifications: [
      { icon: 'zap',   title: '记录提醒',            desc: '离目标还差一些，记得记录下午茶', time: '现在' },
      { icon: 'flame', title: '今日进度 60%',        desc: '保持节奏，晚餐均衡搭配即可达标', time: '15:30' },
      { icon: 'book',  title: '新食谱上线',          desc: '「椰香蔬菜咖喱饭」已加入热门食谱', time: '昨天' },
    ],
    settings: { reminder: true },
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    return { ...defaults(), ...JSON.parse(raw) };
  } catch { return defaults(); }
}

let state = load();
const subs = new Set();

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
}
function emit() { subs.forEach(fn => fn(state)); }

export const store = {
  get: () => state,
  set(patch) { state = { ...state, ...patch }; persist(); emit(); },
  on(fn) { subs.add(fn); return () => subs.delete(fn); },

  total() { return state.meals.reduce((s, m) => s + m.kcal, 0); },
  pct() { return Math.min(1, store.total() / state.goal); },

  addMeal(meal) {
    const m = { id: 'm-' + Date.now().toString(36), ...meal };
    store.set({ meals: [...state.meals, m] });
    return m;
  },
  updateMeal(id, patch) {
    store.set({ meals: state.meals.map(m => (m.id === id ? { ...m, ...patch } : m)) });
  },
  removeMeal(id) { store.set({ meals: state.meals.filter(m => m.id !== id) }); },

  isFav(id) { return state.favorites.includes(id); },
  toggleFav(id) {
    const fav = store.isFav(id)
      ? state.favorites.filter(x => x !== id)
      : [...state.favorites, id];
    store.set({ favorites: fav });
    return fav.includes(id);
  },

  reset() { state = defaults(); state.onboarded = false; persist(); emit(); },
};

// 当前时刻的中文时间，如「下午 3:05」
export function nowLabel(d = new Date()) {
  const h = d.getHours(), m = String(d.getMinutes()).padStart(2, '0');
  const seg = h < 6 ? '凌晨' : h < 11 ? '上午' : h < 13 ? '中午' : h < 18 ? '下午' : '晚上';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${seg} ${h12}:${m}`;
}
