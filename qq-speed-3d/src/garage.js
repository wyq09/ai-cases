// ---------------------------------------------------------------------------
// 难度设置 + 改装工坊 UI
//
// Lives outside main.js so the physics file stays readable. It only owns DOM:
// the difficulty chips on the title / select screens, the garage overlay with
// its five upgradeable parts and the in-race "loadout" chip.
// ---------------------------------------------------------------------------

import { DIFFICULTIES, difficultyOf } from './tracks.js?v=20261019a';
import { PARTS, MAX_LEVEL, PART_BY_ID, tuningStats, upgradeCost } from './tuning.js?v=20261019a';

const ICONS = {
  engine: '<path d="M4 15h3l2-4h6l2 4h3"/><path d="M9 11V8h6v3"/><path d="M3 18h18"/><path d="M7 6h3"/>',
  turbo: '<path d="M13 3l-2 6h4l-2 5h3l-5 7 1-6H8l3-6H8l5-6z"/>',
  grip: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.4"/><path d="M12 4v3M12 17v3M4 12h3M17 12h3"/>',
  aero: '<path d="M3 16h18"/><path d="M6 16l3-6h6l3 6"/><path d="M9 10V7h6v3"/>',
  paint: '<path d="M5 20V9l7-5 7 5v11"/><path d="M10 20v-6h4v6"/><circle cx="12" cy="9" r="1.6"/>',
};

const pct = (v) => {
  const d = Math.round((v - 1) * 100);
  return d > 0 ? `+${d}%` : d < 0 ? `${d}%` : '±0%';
};

export class Garage {
  constructor({ save, onSetDifficulty, onUpgrade, onChange }) {
    this.save = save;
    this.onSetDifficulty = onSetDifficulty;
    this.onUpgrade = onUpgrade;
    this.onChange = onChange;

    this.root = document.getElementById('garage-screen');
    this.list = document.getElementById('garage-list');
    this.coinsEl = document.getElementById('garage-coins');
    this.statsEl = document.getElementById('garage-stats');
    this.diffDesc = document.getElementById('diff-desc');
    this.badge = document.getElementById('garage-badge');
    this.hudChip = document.getElementById('hud-loadout');
    this.visible = false;

    document.querySelectorAll('button[data-diff]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onSetDifficulty?.(btn.dataset.diff);
        this.render();
      });
    });

    document.querySelectorAll('[data-garage]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.show();
      });
    });

    document.getElementById('garage-close')?.addEventListener('click', () => this.hide());
    this.root?.addEventListener('click', (e) => {
      if (e.target === this.root) this.hide();
    });
    this.list?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-part]');
      if (!btn) return;
      this.onUpgrade?.(btn.dataset.part);
      this.render();
    });
  }

  // ---------------------------------------------------------------- render
  render() {
    const diff = difficultyOf(this.save.difficulty);
    document.querySelectorAll('button[data-diff]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.diff === diff.id);
    });
    if (this.diffDesc) this.diffDesc.textContent = `${diff.en} · ${diff.desc}`;
    document.querySelectorAll('.sel-diff').forEach((el) => { el.dataset.diff = diff.id; });
    const tune = tuningStats(this.save.tuning);
    if (this.badge) this.badge.textContent = `Lv.${tune.total}`;
    if (this.hudChip) {
      this.hudChip.textContent = `难度 ${diff.name} · 改装 Lv.${tune.total}`;
      this.hudChip.dataset.diff = diff.id;
    }
    if (!this.visible) return;
    if (this.coinsEl) this.coinsEl.textContent = (this.save.coins || 0).toLocaleString('zh-CN');
    if (this.list) this.list.innerHTML = PARTS.map((p) => this.cardHtml(p)).join('');
    if (this.statsEl) this.statsEl.innerHTML = this.statsHtml(tune, diff);
  }

  cardHtml(part) {
    const lv = this.save.tuning[part.id] || 0;
    const maxed = lv >= MAX_LEVEL;
    const cost = maxed ? 0 : upgradeCost(part.id, lv);
    const afford = !maxed && (this.save.coins || 0) >= cost;
    const row = part.levels[lv];
    const pips = part.levels
      .slice(1)
      .map((_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`)
      .join('');
    return `
      <div class="garage-card" style="--pc:${part.color}" data-part-id="${part.id}">
        <div class="gc-head">
          <div class="gc-ico"><svg viewBox="0 0 24 24">${ICONS[part.icon] || ICONS.engine}</svg></div>
          <div class="gc-title">
            <b>${part.name}</b>
            <span>${part.en} · Lv.${lv}/${MAX_LEVEL}</span>
          </div>
          <div class="gc-pips">${pips}</div>
        </div>
        <div class="gc-desc">${part.desc}</div>
        <div class="gc-bar"><i style="width:${(lv / MAX_LEVEL) * 100}%"></i></div>
        <div class="gc-foot">
          <span class="gc-state">${row.label}${maxed ? ' · 已满级' : ''}</span>
          <button class="gc-buy${maxed ? ' maxed' : afford ? '' : ' poor'}" data-part="${part.id}"
            ${maxed ? 'disabled' : ''}>
            ${maxed ? 'MAX' : `<em>${cost}</em> 金币升级`}
          </button>
        </div>
      </div>`;
  }

  statsHtml(tune, diff) {
    const rows = [
      ['极速上限', `${Math.round(46 * diff.capMul * tune.cap)} km/h 级`, tune.cap * diff.capMul],
      ['喷气时长', pct(tune.boostMul), tune.boostMul],
      ['漂移蓄力', pct(tune.drift), tune.drift],
      ['撞击保留', `${Math.round(tune.wallKeep * 100)}%`, tune.wallKeep / 0.78],
      ['掉宝幸运', pct(tune.luck), tune.luck],
    ];
    return rows
      .map(([k, v, k2]) => {
        const w = Math.max(4, Math.min(100, (k2 - 0.7) / 0.75 * 100));
        return `<div class="gs-row"><span class="k">${k}</span>
          <span class="bar"><i style="width:${w.toFixed(0)}%"></i></span>
          <span class="v">${v}</span></div>`;
      })
      .join('');
  }

  show() {
    this.visible = true;
    this.render();
    this.root?.classList.add('show');
  }

  hide() {
    this.visible = false;
    this.root?.classList.remove('show');
    this.onChange?.();
  }

  get isOpen() {
    return this.visible;
  }
}

export { DIFFICULTIES, PARTS, MAX_LEVEL, PART_BY_ID, tuningStats, upgradeCost };
