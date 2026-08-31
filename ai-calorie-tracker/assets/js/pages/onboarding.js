// 引导页：全屏食物摄影轮播 + 卡路里标注气泡 + CTA
import { store } from '../store.js';
import { el } from '../ui.js';

const SLIDES = [
  {
    img: 'assets/img/hero.jpg',
    title: '你的食物，<br>AI 一眼读懂',
    sub: '从拍下到记录，全程自动完成。',
    tags: [
      { text: '170 千卡', pos: 'top:17%;left:10%', line: 56 },
      { text: '90 千卡',  pos: 'top:30%;left:46%', line: 70 },
      { text: '110 千卡', pos: 'top:14%;right:8%', line: 46 },
    ],
  },
  {
    img: 'assets/img/hero2.jpg',
    title: '拍照即识别，<br>热量营养全知道',
    sub: 'AI 识别上万种食物，自动估算热量与三大营养素。',
    tags: [
      { text: '420 千卡',   pos: 'top:16%;left:11%', line: 52 },
      { text: '12g 蛋白质', pos: 'top:31%;right:9%', line: 66 },
      { text: '350 千卡',   pos: 'top:12%;left:45%', line: 44 },
    ],
  },
  {
    img: 'assets/img/hero3.jpg',
    title: '记录如此简单，<br>目标触手可及',
    sub: '智能仪表盘与热门食谱，帮你轻松达成每日目标。',
    tags: [
      { text: '520 千卡',     pos: 'top:15%;left:12%', line: 48 },
      { text: '86% 每日目标', pos: 'top:30%;left:44%', line: 64 },
      { text: '18g 蛋白质',   pos: 'top:13%;right:8%', line: 44 },
    ],
  },
];

const LAST = SLIDES.length - 1;

// 标注气泡：胶囊 + 垂线 + 端点
function buildTag(t) {
  return el('div', { class: 'ob-tag', style: t.pos },
    el('div', { class: 'ob-tag-float' },
      el('div', { class: 'ob-pill' }, t.text),
      el('i', { class: 'ob-line', style: `height:${t.line}px` }),
      el('i', { class: 'ob-node' }),
    ),
  );
}

function buildSlide(s) {
  return el('div', { class: 'ob-slide' },
    el('img', { class: 'ob-bg', src: s.img, alt: '食物实拍', draggable: 'false' }),
    el('div', { class: 'ob-shade' }),
    el('div', { class: 'ob-tags' }, s.tags.map(buildTag)),
    el('div', { class: 'ob-copy' },
      el('h2', { class: 'ob-title', html: s.title }),
      el('p', { class: 'ob-sub' }, s.sub),
    ),
  );
}

export function render(view) {
  let idx = 0;
  let done = false;

  const track = el('div', { class: 'ob-track' }, SLIDES.map(buildSlide));
  const slides = [...track.children];
  const viewport = el('div', { class: 'ob-viewport' }, track);

  const dots = SLIDES.map((_, i) => el('button', {
    class: 'ob-navdot',
    'aria-label': `第 ${i + 1} 页`,
    onclick: () => go(i),
  }));

  const cta = el('button', { class: 'btn btn-dark', onclick: onCta }, '下一步');
  const skip = el('button', { class: 'ob-skip', 'aria-label': '跳过引导', onclick: finish }, '跳过');

  const root = el('div', { class: 'ob-root', style: 'min-height:100%' },
    viewport,
    el('div', { class: 'ob-dots' }, dots),
    el('div', { class: 'ob-cta' }, cta),
    skip,
  );

  function update() {
    track.style.transform = `translateX(${-idx * 100 / 3}%)`;
    slides.forEach((s, i) => s.classList.toggle('active', i === idx));
    dots.forEach((d, i) => d.classList.toggle('on', i === idx));
    cta.textContent = idx === LAST ? '开始使用' : '下一步';
  }

  function go(i) {
    idx = Math.max(0, Math.min(LAST, i));
    track.style.transition = '';
    update();
  }

  function finish() {
    if (done) return;
    done = true;
    store.set({ onboarded: true });
    location.hash = '#/dashboard';
  }

  function onCta() {
    idx === LAST ? finish() : go(idx + 1);
  }

  // ---- 拖拽滑动（Pointer 事件，仅横向） ----
  let dragging = false;
  let locked = false;
  let startX = 0;
  let startY = 0;
  let dx = 0;

  viewport.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragging = true;
    locked = false;
    dx = 0;
    startX = e.clientX;
    startY = e.clientY;
    track.style.transition = 'none';
    viewport.setPointerCapture?.(e.pointerId);
  });

  viewport.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!locked) {
      if (Math.abs(dx) < 7 && Math.abs(dy) < 7) return;
      if (Math.abs(dy) > Math.abs(dx)) {        // 纵向手势：放弃拖拽
        dragging = false;
        track.style.transition = '';
        return;
      }
      locked = true;
    }
    let off = dx;
    if ((idx === 0 && off > 0) || (idx === LAST && off < 0)) off *= .35;  // 边缘阻尼
    track.style.transform = `translateX(calc(${-idx * 100 / 3}% + ${off}px))`;
  });

  function release() {
    if (!dragging) return;
    dragging = false;
    track.style.transition = '';
    if (locked && Math.abs(dx) > 50) go(idx + (dx < 0 ? 1 : -1));
    else go(idx);                               // 回弹
    locked = false;
  }
  viewport.addEventListener('pointerup', release);
  viewport.addEventListener('pointercancel', release);

  view.append(root);
  update();

  return () => { dragging = false; };
}
