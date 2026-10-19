import { LEVELS, levelSpec, themeCss, trackPath } from './tracks.js?v=20261019a';

const fmt = (ms) => {
  if (!Number.isFinite(ms) || ms <= 0) return '--:--.--';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
};

function starsHtml(n) {
  let out = '';
  for (let i = 0; i < 3; i++) out += `<span class="${i < n ? 'on' : ''}">★</span>`;
  return out;
}

function diffHtml(n) {
  let out = '';
  for (let i = 0; i < 5; i++) out += `<i class="${i < n ? 'on' : ''}"></i>`;
  return out;
}

export class SelectScreen {
  constructor({ isUnlocked, getRecord, getCoins, getEndlessBest, onPick, onEndless, onBack }) {
    this.root = document.getElementById('select-screen');
    this.grid = document.getElementById('select-grid');
    this.coinsEl = document.getElementById('select-coins');
    this.isUnlocked = isUnlocked;
    this.getRecord = getRecord;
    this.getCoins = getCoins;
    this.getEndlessBest = getEndlessBest;
    this.onPick = onPick;
    this.onEndless = onEndless;
    this.onBack = onBack;
    this.visible = false;

    document.getElementById('select-back').addEventListener('click', () => {
      this.hide();
      this.onBack?.();
    });
    this.grid.addEventListener('click', (e) => {
      const card = e.target.closest('.track-card');
      if (!card) return;
      if (card.classList.contains('locked')) {
        card.classList.remove('shake');
        void card.offsetWidth;
        card.classList.add('shake');
        return;
      }
      const id = card.dataset.id;
      if (id === '__endless') {
        this.hide();
        this.onEndless?.();
      } else {
        this.hide();
        this.onPick?.(id);
      }
    });
  }

  render() {
    const coins = this.getCoins?.() || 0;
    if (this.coinsEl) this.coinsEl.textContent = coins.toLocaleString('zh-CN');
    let html = '';
    LEVELS.forEach((level, i) => {
      const spec = levelSpec(level);
      const css = themeCss(spec.theme);
      const rec = this.getRecord?.(level.id) || null;
      const unlocked = this.isUnlocked(level.id);
      const path = trackPath(spec, 100, 0.13);
      const first = path.split(' ')[0].split(',');
      const best = rec && rec.bestTime ? `BEST ${fmt(rec.bestTime)}` : unlocked ? '未挑战' : '完成上一关解锁';
      html += `
        <button class="track-card${unlocked ? '' : ' locked'}" data-id="${level.id}"
          style="--tc-a:${css.accent};--tc-b:${css.accent2};--tc-top:${css.top};--tc-horizon:${css.horizon}"
          aria-label="${level.name}${unlocked ? '' : '（未解锁）'}">
          <div class="tc-art">
            <span class="tc-index">${String(i + 1).padStart(2, '0')}</span>
            <span class="tc-state">${unlocked ? 'READY' : 'LOCKED'}</span>
            <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
              <polygon class="tc-glow" points="${path}" />
              <polygon class="tc-line" points="${path}" />
              <circle class="tc-start" cx="${first[0]}" cy="${first[1]}" r="2.4" />
            </svg>
          </div>
          <div class="tc-info">
            <div class="tc-eyebrow">STAGE ${String(i + 1).padStart(2, '0')}</div>
            <div class="tc-name">${level.name}</div>
            <div class="tc-en">${level.en}</div>
            <div class="tc-meta">
              <span class="tc-diff">${diffHtml(level.difficulty)}</span>
              <span class="tc-stars">${starsHtml(rec?.stars || 0)}</span>
            </div>
            <div class="tc-best">${best}</div>
          </div>
          ${unlocked ? '' : '<div class="tc-lock"><span class="lock-ico">🔒</span><span class="lock-txt">完成上一关解锁</span></div>'}
        </button>`;
    });
    const bestStage = this.getEndlessBest?.() || 0;
    html += `
      <button class="track-card endless" data-id="__endless" aria-label="无限赛道">
        <div class="tc-art">
          <span class="tc-index">∞</span>
          <span class="tc-state">ENDLESS</span>
          <div class="tc-infinity">∞</div>
        </div>
        <div class="tc-info">
          <div class="tc-eyebrow">INFINITE MODE</div>
          <div class="tc-name">无限赛道</div>
          <div class="tc-en">ENDLESS CIRCUIT</div>
          <div class="tc-meta"><span class="tc-desc">每关程序生成 · 主题轮换</span></div>
          <div class="tc-best">${bestStage ? `最佳 STAGE ${bestStage}` : '每阶段前 4 名晋级'}</div>
        </div>
      </button>`;
    this.grid.innerHTML = html;
  }

  show() {
    this.render();
    this.root.classList.add('show');
    this.visible = true;
  }

  hide() {
    this.root.classList.remove('show');
    this.visible = false;
  }
}
