/**
 * app.js — 应用装配:视图渲染 / 事件 / 播放器 / 序列编辑
 * UI 全量由 render() 生成;语言或视图切换时整体重绘,
 * 面板级动画交给 CSS(签名缓动),避免 JS 逐帧操纵布局。
 */
import { AvatarEngine, AvatarInstance } from './core/engine.js';
import { SHAPE_ORDER } from './data/shapes.js';
import { MOOD_ORDER } from './data/moods.js';
import { COLOR_ORDER, colorValue } from './data/colors.js';
import { ANIM_ORDER, ANIMATIONS } from './data/animations.js';
import { initLocale, setLocale, LOCALES } from './i18n.js';
import { loadConfig, saveConfig, loadSequences, saveSequences, defaultClips } from './store.js';
import { exportPng, exportGif, exportWebm, copyPngToClipboard, downloadBlob, exportSequenceGif } from './exporter.js';

const engine = new AvatarEngine();
let lang = initLocale();
const t = (k, ...a) => {
  const v = LOCALES[lang][k];
  return typeof v === 'function' ? v(...a) : v ?? k;
};

const config = loadConfig();
let sequences = loadSequences();
let seqId = sequences[0].id;
let view = 'perso';           // perso | anime | reglages
let previewAnim = null;       // 库里点选的预览状态
let playing = false;
let playClock = 0;            // 轨道播放累计毫秒
let playheadRaf = null;
let menuOpen = false;
let busy = false;             // 导出中
let previewTimer = null;

const $root = document.getElementById('app');

/* ---------- 主头像状态(引擎引用的共享对象) ---------- */
const mainState = {
  shape: config.shape, mood: config.mood,
  color: colorValue(config.color), animId: 'idle',
  transK: 1,
};
let mainAvatar = null;

/* ---------- 序列工具 ---------- */
const seq = () => sequences.find((s) => s.id === seqId);
const seqName = (s) => (s.name === '__default__' ? t('defaultSeq') : s.name);
const seqDuration = (s) => s.clips.reduce((a, c) => a + c.duration, 0);

function persistSeqs() {
  saveSequences(sequences);
}

/* ---------- 渲染 ---------- */
let miniAvatarSeq = []; // 动画库迷你实例

export function render() {
  // 注销旧迷你实例
  miniAvatarSeq = [];
  const total = seqDuration(seq());
  $root.innerHTML = `
  <h1 class="sr-only">bloub</h1>
  <nav class="dock" aria-label="views">
    ${[
      ['perso', 'customize', iconPalette],
      ['anime', 'animate', iconFilm],
      ['reglages', 'settings', iconGear],
    ].map(([v, k, ic]) => `
      <button type="button" data-view="${v}" aria-pressed="${view === v}">
        ${ic()}<span class="tip">${t(k)}</span>
      </button>`).join('')}
  </nav>

  <div class="scene ${view === 'anime' && playing ? '' : 'no-timeline'}">
    <aside class="panneau" aria-label="${t('settings')}">
      ${view === 'reglages' ? panelSettings() : ''}
    </aside>

    <main class="stage">
      <div class="avatar-wrap"><div id="avatar-mount"></div></div>
      <div class="export-bar">
        <div class="export-main">
          <button type="button" id="btn-png">${iconDownload()}<span>${t('exportPng')}</span></button>
          <div class="divider"></div>
          <button type="button" id="btn-menu" class="drop" aria-expanded="${menuOpen}" aria-haspopup="menu">${iconChevron()}</button>
        </div>
        <div class="export-menu ${menuOpen ? 'open' : ''}" role="menu">
          <button type="button" data-export="gif">${t('exportGif')}<small>${t('gifHint')}</small></button>
          <button type="button" data-export="webm">${t('exportWebm')}<small>${t('webmHint')}</small></button>
          <button type="button" data-export="copy">${t('copyImage')}<small>${t('pngHint')}</small></button>
        </div>
        ${busy ? `<div class="export-status">${t('exporting')}</div>` : ''}
      </div>
    </main>

    <aside class="panneau" aria-label="${t('customize')}">
      ${view === 'perso' ? panelCustomize() : ''}
      ${view === 'anime' ? panelLibrary() : ''}
      ${view === 'reglages' ? panelAbout() : ''}
    </aside>
  </div>

  ${view === 'anime' ? panelTimeline(total) : ''}
  `;
  mountAvatar();
  bindEvents();
}

function panelCustomize() {
  return `
    <h2>${t('shapes')}</h2>
    <div class="grid-4">
      ${SHAPE_ORDER.map((id) => `
        <button type="button" class="cell" data-shape="${id}" aria-pressed="${config.shape === id}">
          <span class="mini" data-mini="shape-${id}"></span><span>${t('shape_' + id)}</span>
        </button>`).join('')}
    </div>
    <h2 style="margin-top:1.4rem">${t('moods')}</h2>
    <div class="grid-4">
      ${MOOD_ORDER.map((id) => `
        <button type="button" class="cell" data-mood="${id}" aria-pressed="${config.mood === id}">
          <span class="mini" data-mini="mood-${id}"></span><span>${t('mood_' + id)}</span>
        </button>`).join('')}
    </div>
    <h2 style="margin-top:1.4rem">${t('colors')}</h2>
    <div class="swatches">
      ${COLOR_ORDER.map((id) => `
        <button type="button" class="swatch" data-color="${id}" aria-pressed="${config.color === id}"
          aria-label="${t('color_' + id)}" style="background:${colorValue(id)}"></button>`).join('')}
    </div>`;
}

function panelLibrary() {
  return `
    <h2>${t('animations')}</h2>
    <p class="hint">${t('addHint')}</p>
    <div class="anim-grid">
      ${ANIM_ORDER.map((id) => `
        <button type="button" class="cell" data-anim="${id}" aria-pressed="${previewAnim === id}">
          <span class="mini" data-mini="anim-${id}" data-anim-preview="${id}"></span><span>${t(id)}</span>
        </button>`).join('')}
    </div>`;
}

function panelSettings() {
  return `
    <h2>${t('language')}</h2>
    <div class="lang-list" role="radiogroup" aria-label="${t('language')}">
      ${Object.entries(LOCALES).map(([id, l]) => `
        <button type="button" class="lang-row" role="radio" aria-checked="${lang === id}" data-lang="${id}">
          <span aria-hidden="true">${l.flag}</span><span>${l.label}</span>
          <svg class="check" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2.5 6.4 4.8 8.7 9.5 3.6" fill="none" stroke="currentColor" stroke-width="1.6"
              stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>`).join('')}
    </div>`;
}

function panelAbout() {
  return `
    <h2 style="margin-top:1.4rem">${t('about')}</h2>
    <a class="about-card" href="https://github.com/" target="_blank" rel="noreferrer noopener">
      ${iconGithub()}<span>${t('viewOnGitHub')}</span><span class="ext">${iconExt()}</span>
    </a>
    <p class="credit">bloub — ${t('madeBy', 'you')}</p>`;
}

function panelTimeline(totalMs) {
  const s = seq();
  return `
  <footer class="timeline" style="position:fixed;left:0;right:0;bottom:0;z-index:25;
    height:var(--timeline);background:rgba(255,255,255,.92);border-top:1px solid var(--line);
    backdrop-filter:blur(14px);padding:.7rem 1.2rem;display:flex;flex-direction:column;gap:.4rem">
    <div style="display:flex;align-items:center;gap:.4rem">
      <select id="seq-select" aria-label="sequence">
        ${sequences.map((x) => `<option value="${x.id}" ${x.id === seqId ? 'selected' : ''}>${seqName(x)}</option>`).join('')}
      </select>
      <button type="button" class="icon-btn" id="seq-new" title="${t('newSequence')}">＋</button>
      <button type="button" class="icon-btn" id="seq-rename" title="${t('renameSequence')}">✎</button>
      <button type="button" class="icon-btn danger" id="seq-del" title="${t('delete')}">🗑</button>
      <div style="flex:1"></div>
      <button type="button" class="btn-ghost" id="seq-export">${iconDownload()} ${t('exportSequence')}</button>
      <button type="button" class="btn-primary" id="btn-play">
        ${playing ? `■ ${t('stop')}` : `▶ ${t('play')}`}
      </button>
    </div>
    <div class="track" id="track">
      ${s.clips.length ? s.clips.map((c, i) => `
        <div class="clip ${playing && clipIndexAt(playClock) === i ? 'playing' : ''}"
             data-clip="${i}" style="width:${Math.max(74, (c.duration / totalMs) * 640)}px">
          <span class="clip-name">${t(c.anim)}</span>
          <span class="clip-len">${(c.duration / 1000).toFixed(1)} ${t('seconds')}</span>
          <button type="button" class="clip-x" data-clip-x="${i}" title="${t('remove')}">✕</button>
        </div>`).join('') : `<div class="track-empty">${t('addHint')}</div>`}
      ${playing ? `<div class="playhead" style="left:${playheadX(totalMs)}px"></div>` : ''}
    </div>
  </footer>`;
}

function playheadX(totalMs) {
  const track = document.getElementById('track');
  if (!track) return 0;
  const w = track.clientWidth - 22;
  return 11 + ((playClock % totalMs) / totalMs) * w;
}

function clipIndexAt(ms) {
  const clips = seq().clips;
  let acc = 0;
  for (let i = 0; i < clips.length; i++) {
    acc += clips[i].duration;
    if (ms < acc) return i;
  }
  return 0;
}

/* ---------- 头像挂载 ---------- */
function mountAvatar() {
  const mount = document.getElementById('avatar-mount');
  mainAvatar = new AvatarInstance(mount, { size: 440 });
  mainAvatar.state = mainState;
  mainAvatar.setColor(mainState.color);
  engine.register(mainAvatar);
  // 迷你预览:形状/表情按钮用静态帧,动画库按钮用实时动画
  document.querySelectorAll('[data-mini]').forEach((el) => {
    const st = { shape: config.shape, mood: config.mood, color: mainState.color, animId: 'idle', transK: 1 };
    if (el.dataset.mini.startsWith('shape-')) st.shape = el.dataset.mini.slice(6);
    if (el.dataset.mini.startsWith('mood-')) st.mood = el.dataset.mini.slice(5);
    if (el.dataset.mini.startsWith('anim-')) {
      st.animId = el.dataset.animPreview;
      if (previewAnim && st.animId !== previewAnim && el.dataset.animPreview !== 'idle') {
        // 非选中的库项低速播放,视觉降噪
      }
      st.animId = previewAnim ?? st.animId;
    }
    const inst = new AvatarInstance(el, { size: 60 });
    inst.state = st;
    inst.setColor(mainState.color);
    inst._meta = {
      kind: el.dataset.mini.startsWith('shape-') ? 'shape'
        : el.dataset.mini.startsWith('mood-') ? 'mood' : 'anim',
      id: el.dataset.animPreview ?? el.dataset.mini.split('-').slice(1).join('-'),
    };
    engine.register(inst);
    miniAvatarSeq.push(inst);
  });
}

/* ---------- 事件 ---------- */
function bindEvents() {
  document.querySelectorAll('[data-view]').forEach((b) =>
    b.addEventListener('click', () => {
      view = b.dataset.view;
      playing = false;
      stopPlayback();
      render();
    }));

  // 个性化:局部更新(保持面板动画状态,不整页重绘)
  document.querySelectorAll('[data-shape]').forEach((b) =>
    b.addEventListener('click', () => {
      config.shape = b.dataset.shape;
      mainState.shape = b.dataset.shape;
      saveConfig(config);
      document.querySelectorAll('[data-shape]').forEach((x) =>
        x.setAttribute('aria-pressed', x.dataset.shape === b.dataset.shape));
      syncMinis();
    }));
  document.querySelectorAll('[data-mood]').forEach((b) =>
    b.addEventListener('click', () => {
      config.mood = b.dataset.mood;
      mainState.mood = b.dataset.mood;
      saveConfig(config);
      document.querySelectorAll('[data-mood]').forEach((x) =>
        x.setAttribute('aria-pressed', x.dataset.mood === b.dataset.mood));
      syncMinis();
    }));
  document.querySelectorAll('[data-color]').forEach((b) =>
    b.addEventListener('click', () => {
      config.color = b.dataset.color;
      mainState.color = colorValue(b.dataset.color);
      saveConfig(config);
      mainAvatar.setColor(mainState.color);
      miniAvatarSeq.forEach((i) => i.setColor(mainState.color));
      document.querySelectorAll('[data-color]').forEach((x) =>
        x.setAttribute('aria-pressed', x.dataset.color === b.dataset.color));
    }));

  // 动画库:点击预览(局部更新,不打断面板过渡),2.4s 后回到空闲
  document.querySelectorAll('[data-anim]').forEach((b) =>
    b.addEventListener('click', () => {
      previewAnim = b.dataset.anim;
      engine.setAnimation(mainState, previewAnim);
      document.querySelectorAll('[data-anim]').forEach((x) =>
        x.setAttribute('aria-pressed', x.dataset.anim === previewAnim));
      clearTimeout(previewTimer);
      previewTimer = setTimeout(() => {
        previewAnim = null;
        engine.setAnimation(mainState, playing ? seq().clips[clipIndexAt(playClock)]?.anim || 'idle' : 'idle');
        if (view === 'anime') {
          document.querySelectorAll('[data-anim]').forEach((x) =>
            x.setAttribute('aria-pressed', 'false'));
        }
      }, 2400);
    }));

  // 时间轴
  document.getElementById('btn-play')?.addEventListener('click', togglePlay);
  document.getElementById('seq-select')?.addEventListener('change', (e) => {
    seqId = e.target.value;
    render();
  });
  document.getElementById('seq-new')?.addEventListener('click', () =>
    promptDialog(t('newSequence'), t('sequenceName'), '', (name) => {
      if (!name) return;
      const s = { id: 's' + Date.now(), name, clips: defaultClips().slice(0, 2) };
      sequences.push(s);
      seqId = s.id;
      persistSeqs();
      render();
    }));
  document.getElementById('seq-rename')?.addEventListener('click', () => {
    const s = seq();
    if (s.name === '__default__') return;
    promptDialog(t('renameSequence'), t('sequenceName'), s.name, (name) => {
      if (!name) return;
      s.name = name;
      persistSeqs();
      render();
    });
  });
  document.getElementById('seq-del')?.addEventListener('click', () => {
    const s = seq();
    if (s.name === '__default__' || sequences.length === 1) return;
    confirmDialog(t('deleteConfirm', seqName(s), s.clips.length), () => {
      sequences = sequences.filter((x) => x.id !== s.id);
      seqId = sequences[0].id;
      persistSeqs();
      render();
    });
  });
  document.querySelectorAll('[data-clip-x]').forEach((b) =>
    b.addEventListener('click', () => {
      seq().clips.splice(+b.dataset.clipX, 1);
      persistSeqs();
      render();
    }));
  document.getElementById('seq-export')?.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    render();
    try {
      const clips = seq().clips;
      const blob = await exportSequenceGif(clips, (c) => ({
        shape: mainState.shape, mood: mainState.mood,
        color: mainState.color, animId: c.anim,
      }), { bg: '#ffffff' });
      downloadBlob(blob, 'bloub-sequence.gif');
    } finally {
      busy = false;
      render();
    }
  });

  // 导出
  document.getElementById('btn-png')?.addEventListener('click', async () => {
    const blob = await exportPng(mainState, 720, null);
    downloadBlob(blob, 'bloub.png');
  });
  document.getElementById('btn-menu')?.addEventListener('click', () => {
    menuOpen = !menuOpen;
    render();
  });
  document.querySelectorAll('[data-export]').forEach((b) =>
    b.addEventListener('click', () => runExport(b.dataset.export)));

  // 语言
  document.querySelectorAll('[data-lang]').forEach((b) =>
    b.addEventListener('click', () => {
      lang = b.dataset.lang;
      setLocale(lang);
      render();
    }));

  // 全局点击收起导出菜单
  document.addEventListener('click', (e) => {
    if (menuOpen && !e.target.closest('.export-bar')) {
      menuOpen = false;
      render();
    }
  }, { once: true });
}

function syncMinis() {
  // 形状按钮 = 自身形状 × 当前表情;表情按钮 = 当前形状 × 自身表情
  for (const inst of miniAvatarSeq) {
    const meta = inst._meta;
    if (!meta) continue;
    if (meta.kind === 'shape') { inst.state.shape = meta.id; inst.state.mood = config.mood; }
    else if (meta.kind === 'mood') { inst.state.shape = config.shape; inst.state.mood = meta.id; }
  }
}

/* ---------- 播放器 ---------- */
function togglePlay() {
  playing = !playing;
  if (playing) {
    playClock = 0;
    tickPlayback(performance.now());
  } else {
    stopPlayback();
    engine.setAnimation(mainState, 'idle');
  }
  render();
}

function stopPlayback() {
  if (playheadRaf) cancelAnimationFrame(playheadRaf);
  playheadRaf = null;
  playing = false;
}

function tickPlayback(now) {
  if (!playing) return;
  const total = seqDuration(seq());
  const prev = playClock;
  playClock += 1000 / 60;
  const idx = clipIndexAt(playClock);
  const clip = seq().clips[idx];
  if (clip && mainState.animId !== clip.anim) engine.setAnimation(mainState, clip.anim);
  // 轨道正在播放的片段高亮 + 播放头移动(直接改样式,不重渲染)
  const head = document.querySelector('.playhead');
  if (head) head.style.left = playheadX(total) + 'px';
  document.querySelectorAll('.clip').forEach((el, i) =>
    el.classList.toggle('playing', i === idx));
  if (playClock >= total) playClock = 0; // 循环
  playheadRaf = requestAnimationFrame(tickPlayback);
}

/* ---------- 导出 ---------- */
async function runExport(kind) {
  if (busy) return;
  menuOpen = false;
  busy = true;
  render();
  try {
  if (kind === 'gif') {
    const bg = await gifBgDialog();
    if (!bg) return;
    const blob = await exportGif(mainState, { bg: bg === 'white' ? '#ffffff' : null });
    downloadBlob(blob, 'bloub.gif');
  } else if (kind === 'webm') {
      const blob = await exportWebm(mainState, {});
      downloadBlob(blob, 'bloub.webm');
    } else if (kind === 'copy') {
      await copyPngToClipboard(mainState);
    }
  } catch (err) {
    console.error(err);
  } finally {
    busy = false;
    render();
  }
}

/* ---------- 对话框 ---------- */
/** GIF 背景选择:resolve 'white' | 'transparent' | null(取消) */
function gifBgDialog() {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dialogue';
    dlg.innerHTML = `
      <form method="dialog" style="display:flex;flex-direction:column;gap:.3rem">
        <h3>${t('exportGif')}</h3>
        <p class="note">${t('gifTransparentNote')}</p>
        <div class="opts">
          <label class="opt">
            <input type="radio" name="fond" value="white" checked />
            <span><b>${t('whiteBg')}</b><small>${t('whiteBgNote')}</small></span>
          </label>
          <label class="opt">
            <input type="radio" name="fond" value="transparent" />
            <span><b>${t('transparentBg')}</b><small>${t('transparentBgNote')}</small></span>
          </label>
        </div>
        <div class="actions">
          <button type="button" class="btn-text" data-cancel>${t('cancel')}</button>
          <button type="submit" class="btn-text" style="background:var(--ink);color:var(--paper)">${t('download')}</button>
        </div>
      </form>`;
    document.body.appendChild(dlg);
    dlg.showModal();
    dlg.querySelector('[data-cancel]').onclick = () => { resolve(null); dlg.close(); };
    dlg.querySelector('form').onsubmit = () => {
      resolve(dlg.querySelector('input[name=fond]:checked').value);
    };
    dlg.addEventListener('close', () => { dlg.remove(); resolve(null); });
    dlg.addEventListener('cancel', () => resolve(null));
  });
}

function promptDialog(title, label, value, onSubmit) {
  const dlg = document.createElement('dialog');
  dlg.className = 'dialogue';
  dlg.innerHTML = `
    <form method="dialog" style="display:flex;flex-direction:column;gap:.4rem">
      <h3>${title}</h3>
      <input type="text" name="name" value="${value ?? ''}" placeholder="${label}" />
      <div class="actions">
        <button type="button" class="btn-text" data-cancel>${t('cancel')}</button>
        <button type="submit" class="btn-text" style="background:var(--ink);color:var(--paper)">${t('create')}</button>
      </div>
    </form>`;
  document.body.appendChild(dlg);
  dlg.showModal();
  const input = dlg.querySelector('input');
  input.select();
  dlg.querySelector('[data-cancel]').onclick = () => dlg.close();
  dlg.querySelector('form').onsubmit = (e) => {
    onSubmit(input.value.trim());
  };
  dlg.addEventListener('close', () => dlg.remove());
}

function confirmDialog(message, onOk) {
  const dlg = document.createElement('dialog');
  dlg.className = 'dialogue';
  dlg.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:.4rem">
      <p style="font-size:.8125rem;line-height:1.5">${message}</p>
      <div class="actions">
        <button type="button" class="btn-text" data-cancel>${t('cancel')}</button>
        <button type="button" class="btn-text" data-ok style="background:var(--danger);color:#fff">${t('delete')}</button>
      </div>
    </div>`;
  document.body.appendChild(dlg);
  dlg.showModal();
  dlg.querySelector('[data-cancel]').onclick = () => dlg.close();
  dlg.querySelector('[data-ok]').onclick = () => { onOk(); dlg.close(); };
  dlg.addEventListener('close', () => dlg.remove());
}

/* ---------- 图标(自绘线性图标) ---------- */
function svgWrap(inner) {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}
const iconPalette = () => svgWrap(
  '<circle cx="12" cy="12" r="9"/><circle cx="9" cy="9.5" r="1" fill="currentColor" stroke="none"/>' +
  '<circle cx="14.5" cy="8" r="1" fill="currentColor" stroke="none"/>' +
  '<circle cx="15.5" cy="13" r="1" fill="currentColor" stroke="none"/>');
const iconFilm = () => svgWrap(
  '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M8 4.5v15M16 4.5v15M3.5 9h4.5M3.5 15h4.5M16 9h4.5M16 15h4.5"/>');
const iconGear = () => svgWrap(
  '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7"/>');
const iconDownload = () => svgWrap(
  '<path d="M12 4v11M7.6 11.2 12 15.6l4.4-4.4M5 19.5h14"/>');
const iconChevron = () => svgWrap('<path d="M6.5 9.5 12 15l5.5-5.5"/>');
const iconExt = () =>
  '<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2h6v6M10 2 3 9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const iconGithub = () =>
  '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 .8a7.2 7.2 0 0 0-2.28 14.03c.36.07.5-.16.5-.35v-1.22c-2 .43-2.43-.96-2.43-.96-.33-.83-.8-1.05-.8-1.05-.65-.45.05-.44.05-.44.72.05 1.1.74 1.1.74.64 1.1 1.68.78 2.09.6.06-.47.25-.78.45-.96-1.6-.18-3.28-.8-3.28-3.56 0-.79.28-1.43.74-1.94-.07-.18-.32-.91.07-1.9 0 0 .6-.2 1.98.74a6.9 6.9 0 0 1 3.6 0c1.37-.93 1.97-.74 1.97-.74.4.99.15 1.72.07 1.9.46.5.74 1.15.74 1.94 0 2.77-1.69 3.38-3.3 3.56.26.22.49.66.49 1.33v1.97c0 .19.13.42.5.35A7.2 7.2 0 0 0 8 .8Z"/></svg>';

/* ---------- 启动 ---------- */
render();
