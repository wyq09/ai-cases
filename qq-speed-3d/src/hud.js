import { ITEMS } from './items.js?v=20261018a';

const fmt = (ms) => {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
};

const PLACE_NAME = ['冠军', '亚军', '季军', '第四名', '第五名', '第六名'];

export class HUD {
  constructor(track) {
    this.track = track;
    this.root = document.getElementById('hud');
    this.title = document.getElementById('title-screen');
    this.result = document.getElementById('result-screen');
    this.pause = document.getElementById('pause-screen');
    this.rankEl = document.getElementById('rank-num');
    this.lapEl = document.getElementById('lap-num');
    this.timeEl = document.getElementById('race-time');
    this.speedEl = document.getElementById('speed-num');
    this.nitroCells = [...document.querySelectorAll('.nitro-cell')];
    this.driftFill = document.getElementById('drift-fill');
    this.driftWrap = document.getElementById('drift-meter');
    this.callout = document.getElementById('callout');
    this.calloutMain = this.callout.querySelector('.main');
    this.calloutSub = this.callout.querySelector('.sub');
    this.countdownEl = document.getElementById('countdown');
    this.countdownNum = document.getElementById('countdown-num');
    this.startTip = document.getElementById('start-tip');
    this.boostFlash = document.getElementById('boost-flash');
    this.speedo = document.getElementById('speedo');
    this.hudSpeedBar = document.getElementById('speed-bar');
    this.nitroLabel = document.querySelector('#speedo .unit');
    this.minimap = document.getElementById('minimap');
    this.mm = this.minimap.getContext('2d');
    this.mapSize = 160;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.minimap.width = this.mapSize * this.dpr;
    this.minimap.height = this.mapSize * this.dpr;
    this.lines = document.getElementById('speedlines');
    this.lctx = this.lines.getContext('2d');
    this.lineSeeds = [];
    for (let i = 0; i < 78; i++) {
      this.lineSeeds.push({
        angle: Math.random() * Math.PI * 2,
        phase: Math.random(),
        speed: 0.55 + Math.random() * 1.3,
        len: 0.35 + Math.random() * 0.9,
        w: 0.6 + Math.random() * 1.8,
        alpha: 0.25 + Math.random() * 0.75,
        cyan: Math.random() > 0.72,
      });
    }
    this.time = 0;
    this.intensity = 0;
    this.lastRank = null;
    this.lastLap = null;
    this.calloutTimer = 0;
    this.toastTimer = 0;
    this.lastMinimap = 0;
    this.mapBg = document.createElement('canvas');
    this.mapBg.width = this.mapBg.height = 320;

    this.mapName = document.getElementById('map-name');
    this.mapEn = document.getElementById('map-en');
    this.stageCell = document.getElementById('stage-cell');
    this.stageNum = document.getElementById('stage-num');
    this.itemSlot = document.getElementById('item-slot');
    this.itemGlyph = document.getElementById('item-glyph');
    this.itemName = document.getElementById('item-name');
    this.itemTag = document.getElementById('item-tag');
    this.itemToastEl = document.getElementById('item-toast');
    this.shieldPill = document.getElementById('shield-pill');
    this.shieldText = document.getElementById('shield-time');
    this.shieldFill = document.getElementById('shield-fill');
    this.starsEl = document.getElementById('result-stars');

    this.drawMapBackground();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // ---------------------------------------------------------------- track UI
  setTrack(track) {
    this.track = track;
    if (this.mapName) this.mapName.textContent = track.name || '极速赛道';
    if (this.mapEn) this.mapEn.textContent = track.en || 'CIRCUIT';
    this.lastRank = null;
    this.lastLap = null;
    this.drawMapBackground();
  }

  setMode({ mode = 'campaign', stage = 1, name, en, laps } = {}) {
    if (this.stageCell) this.stageCell.classList.toggle('hide', mode !== 'endless');
    if (this.stageNum) this.stageNum.textContent = stage;
    if (name && this.mapName) this.mapName.textContent = name;
    if (en && this.mapEn) this.mapEn.textContent = en;
    if (laps) this.root.dataset.laps = laps;
    this.root.dataset.mode = mode;
  }

  setStage(stage) {
    if (this.stageNum) this.stageNum.textContent = stage;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(1.6, window.devicePixelRatio || 1);
    this.lines.width = Math.round(w * dpr);
    this.lines.height = Math.round(h * dpr);
    this.lines.style.width = w + 'px';
    this.lines.style.height = h + 'px';
    this.lineDpr = dpr;
  }

  drawMapBackground() {
    const ctx = this.mapBg.getContext('2d');
    const S = 320;
    ctx.clearRect(0, 0, S, S);
    const pts = this.track.minimap.points;
    const trace = () => {
      ctx.beginPath();
      pts.forEach((p, i) => {
        const x = p.x * S;
        const y = p.y * S;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
    };
    trace();
    ctx.strokeStyle = 'rgba(2,12,24,.85)';
    ctx.lineWidth = 22;
    ctx.lineJoin = 'round';
    ctx.stroke();
    trace();
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.lineWidth = 11;
    ctx.stroke();
    trace();
    ctx.strokeStyle = 'rgba(50,230,255,.85)';
    ctx.lineWidth = 4;
    ctx.stroke();
    // boost pads
    for (const pad of this.track.minimap.padCenters) {
      const f = this.track.frameAt(pad.u);
      const m = this.track.minimap.mapProject(
        f.p.x + f.right.x * pad.lane,
        f.p.z + f.right.z * pad.lane
      );
      ctx.fillStyle = '#6ff4ff';
      ctx.beginPath();
      ctx.arc(m.x * S, m.y * S, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // start line
    const s = this.track.minimap.points[0];
    ctx.fillStyle = '#ff7a1a';
    ctx.fillRect(s.x * S - 7, s.y * S - 7, 14, 14);
  }

  // ---------------------------------------------------------------- menu
  showHUD(v) {
    this.root.classList.toggle('on', v);
  }

  showTitle(v) {
    this.title.classList.toggle('hidden', !v);
  }

  setMenuStats({ coins = 0, best = 0, races = 0, cleared = null, total = null, endlessBest = 0 }) {
    const c = document.getElementById('menu-coins');
    const b = document.getElementById('menu-best');
    const r = document.getElementById('menu-races');
    if (c) c.textContent = coins.toLocaleString('zh-CN');
    if (b) b.textContent = best ? fmt(best) : '--:--.--';
    if (r) r.textContent = cleared != null && total != null ? `${cleared}/${total}` : races;
    const e = document.getElementById('menu-endless-best');
    if (e) e.textContent = endlessBest ? `无尽最佳 STAGE ${endlessBest}` : '无限赛道 · 每阶段前 4 名晋级';
  }

  setCountdown(text, state = '') {
    if (!text) {
      this.countdownEl.classList.remove('show');
      this.countdownNum.textContent = '';
      return;
    }
    this.countdownNum.textContent = text;
    this.countdownEl.className = 'show ' + state;
    this.countdownNum.style.animation = 'none';
    void this.countdownNum.offsetWidth;
    this.countdownNum.style.animation = '';
  }

  setStartTip(show) {
    this.startTip.classList.toggle('show', show);
  }

  showCallout(main, sub = '', kind = '') {
    this.calloutMain.textContent = main;
    this.calloutSub.textContent = sub;
    this.callout.dataset.kind = kind;
    this.callout.classList.remove('show');
    void this.callout.offsetWidth;
    this.callout.classList.add('show');
    this.calloutTimer = Math.max(1.1, 0.7 + main.length * 0.09);
  }

  flashBoost(kind = 'boost') {
    this.boostFlash.className = '';
    void this.boostFlash.offsetWidth;
    this.boostFlash.className = 'flash ' + kind;
  }

  // ---------------------------------------------------------------- items
  setItem(id) {
    const def = id ? ITEMS[id] : null;
    if (!this.itemSlot) return;
    this.itemSlot.dataset.item = def ? id : 'none';
    this.itemSlot.classList.toggle('ready', !!def);
    if (this.itemGlyph) this.itemGlyph.setAttribute('href', `#ico-item-${def ? id : 'none'}`);
    if (this.itemName) this.itemName.textContent = def ? def.name : '暂无道具';
    if (this.itemTag) this.itemTag.textContent = def ? def.short : 'ITEM';
    if (def) this.itemSlot.style.setProperty('--item-color', def.color);
    if (def) {
      this.itemSlot.classList.remove('pop');
      void this.itemSlot.offsetWidth;
      this.itemSlot.classList.add('pop');
    }
  }

  itemToast(item) {
    if (!this.itemToastEl || !item) return;
    this.itemToastEl.textContent = item.name;
    this.itemToastEl.style.color = item.color || '#eafcff';
    this.itemToastEl.classList.remove('show');
    void this.itemToastEl.offsetWidth;
    this.itemToastEl.classList.add('show');
    this.toastTimer = 1.7;
  }

  setShield(t) {
    if (!this.shieldPill) return;
    const on = t > 0;
    this.shieldPill.classList.toggle('on', on);
    if (on) {
      if (this.shieldText) this.shieldText.textContent = `${t.toFixed(1)}s`;
      if (this.shieldFill) this.shieldFill.style.width = `${Math.min(100, (t / 8) * 100).toFixed(1)}%`;
    }
  }

  // ---------------------------------------------------------------- update
  update(dt, d) {
    this.time += dt;
    if (this.calloutTimer > 0) {
      this.calloutTimer -= dt;
      if (this.calloutTimer <= 0) this.callout.classList.remove('show');
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.itemToastEl?.classList.remove('show');
    }
    const kmh = Math.round(d.speedKmh);
    this.speedEl.textContent = kmh;
    const speedPct = Math.min(1, kmh / 360);
    if (this.hudSpeedBar) this.hudSpeedBar.style.width = (speedPct * 100).toFixed(1) + '%';
    this.speedo.classList.toggle('boosting', kmh > 230 || !!d.nitro);
    if (this.nitroLabel) {
      const ready = d.nitro >= 1;
      this.nitroLabel.textContent = d.nitroActive ? 'NITRO ACTIVE' : ready ? 'NITRO READY' : 'NITRO CHARGING';
    }
    this.rankEl.textContent = d.rank;
    this.lapEl.textContent = d.lap;
    if (d.stage != null && this.stageNum) this.stageNum.textContent = d.stage;
    this.timeEl.textContent = fmt(d.raceMs);
    if (this.lastRank !== d.rank) {
      this.lastRank = d.rank;
      this.rankEl.classList.remove('pulse');
      void this.rankEl.offsetWidth;
      this.rankEl.classList.add('pulse');
    }
    if (this.lastLap !== d.lap) {
      this.lastLap = d.lap;
      this.lapEl.classList.remove('pulse');
      void this.lapEl.offsetWidth;
      this.lapEl.classList.add('pulse');
    }
    this.nitroCells.forEach((cell, i) => {
      const fill = Math.max(0, Math.min(1, d.nitro - i));
      cell.style.setProperty('--fill', (fill * 100).toFixed(1) + '%');
      cell.classList.toggle('full', fill >= 0.999);
      cell.classList.toggle('charging', fill > 0.01 && fill < 0.999 && !!d.drifting);
    });
    const charge = Math.max(0, Math.min(1, d.driftCharge || 0));
    this.driftWrap.classList.toggle('on', d.drifting || charge > 0.02);
    this.driftFill.style.width = (charge * 100).toFixed(1) + '%';
    this.driftWrap.dataset.level = d.driftLevel || 0;
    this.root.classList.toggle('offroad', !!d.offroad);
    this.root.classList.toggle('stunned', !!d.stunned);
    this.setShield(d.shield || 0);

    this.drawMinimap(d.karts, d.playerYaw);
    this.drawSpeedlines(d, kmh);
  }

  drawMinimap(karts, playerYaw) {
    const ctx = this.mm;
    const S = this.mapSize;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, S, S);
    ctx.drawImage(this.mapBg, 0, 0, S, S);
    // item crates
    if (this.track.itemBoxes) {
      for (const box of this.track.itemBoxes) {
        if (!box.active) continue;
        const m = this.track.minimap.mapProject(box.center.x, box.center.z);
        ctx.save();
        ctx.translate(m.x * S, m.y * S);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#ffd23f';
        ctx.fillRect(-2.6, -2.6, 5.2, 5.2);
        ctx.restore();
      }
    }
    if (!karts) return;
    for (const k of karts) {
      const m = this.track.minimap.mapProject(k.x, k.z);
      const x = m.x * S;
      const y = m.y * S;
      if (k.isPlayer) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI - k.yaw);
        ctx.shadowColor = '#ffb02e';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(6.5, 7);
        ctx.lineTo(0, 3.5);
        ctx.lineTo(-6.5, 7);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(6,18,32,.85)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.fillStyle = k.color;
        ctx.arc(x, y, 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(4,14,26,.75)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }
  }

  drawSpeedlines(d, kmh) {
    const ctx = this.lctx;
    const w = this.lines.width;
    const h = this.lines.height;
    const target = Math.max(0, Math.min(1,
      (kmh - 150) / 160 * 0.55 + (d.nitroActive ? 0.5 : 0) + (d.drifting ? 0.1 : 0)
    ));
    this.intensity += (target - this.intensity) * Math.min(1, d.dt * 6);
    const I = this.intensity;
    ctx.clearRect(0, 0, w, h);
    if (I < 0.015) return;
    const cx = w * 0.5;
    const cy = h * 0.46;
    const minDim = Math.min(w, h);
    const t = this.time;
    for (const L of this.lineSeeds) {
      const phase = (L.phase + t * L.speed * 0.6) % 1;
      const r0 = minDim * (0.34 + phase * 0.58);
      const len = minDim * (0.03 + I * 0.13) * L.len;
      const ca = Math.cos(L.angle);
      const sa = Math.sin(L.angle);
      const edge = Math.min(1, (r0 / minDim - 0.34) * 3.2);
      const alpha = I * L.alpha * (0.22 + edge * 0.78) * (1 - phase * 0.35);
      ctx.strokeStyle = L.cyan
        ? `rgba(170,248,255,${alpha})`
        : `rgba(255,255,255,${alpha * 0.8})`;
      ctx.lineWidth = (L.w * (0.5 + I * 1.1)) * this.lineDpr;
      ctx.beginPath();
      ctx.moveTo(cx + ca * r0, cy + sa * r0);
      ctx.lineTo(cx + ca * (r0 + len), cy + sa * (r0 + len));
      ctx.stroke();
    }
  }

  // ---------------------------------------------------------------- result
  showResult(data) {
    const endless = data.endless;
    const place = data.place;
    const kicker = document.getElementById('result-kicker');
    if (kicker) {
      kicker.textContent = endless
        ? 'ENDLESS RUN COMPLETE'
        : `STAGE ${String(data.levelIndex || 1).padStart(2, '0')} · RACE COMPLETE`;
    }
    document.getElementById('result-place').textContent = endless ? endless.stage : place;
    document.getElementById('result-place-name').textContent = endless
      ? `STAGE ${endless.stage}`
      : (PLACE_NAME[place - 1] || `第 ${place} 名`);
    const stars = this.starsEl;
    if (stars) {
      const n = endless ? 0 : (data.stars || 0);
      [...stars.children].forEach((el, i) => el.classList.toggle('on', i < n));
      stars.classList.toggle('hide', !!endless);
    }
    document.getElementById('result-time').textContent = fmt(data.time);
    document.getElementById('result-best').textContent = data.best ? fmt(data.best) : '--:--.--';
    document.getElementById('result-coins').textContent = '+' + data.coins;
    document.getElementById('result-total').textContent = (data.totalCoins ?? 0).toLocaleString('zh-CN');
    document.getElementById('result-history').textContent = endless
      ? (data.historyBest ? `STAGE ${data.historyBest}` : '--')
      : (data.historyBest ? fmt(data.historyBest) : '--:--.--');
    const historyLabel = document.getElementById('result-history-label');
    if (historyLabel) historyLabel.textContent = endless ? '历史最佳阶段' : '历史最佳';
    document.getElementById('result-newbest').classList.toggle('on', !!data.newBest);
    const trackEl = document.getElementById('result-track');
    if (trackEl) trackEl.textContent = data.levelName || '极速赛道';
    const dbl = document.getElementById('result-double');
    if (dbl) dbl.textContent = `${data.doubleBoosts || 0} 次 · 氮气 ${data.nitroUses || 0} 次`;
    const itm = document.getElementById('result-items');
    if (itm) {
      const s = data.itemStats || {};
      itm.textContent = `${s.used || 0} 次 · 命中 ${s.hits || 0} 次`;
    }
    const unlock = document.getElementById('result-unlock');
    if (unlock) {
      unlock.textContent = data.unlocked ? `🔓 新赛道解锁：${data.unlocked}` : '';
      unlock.classList.toggle('on', !!data.unlocked);
    }
    const stats = document.getElementById('result-stat-rows');
    if (stats) stats.dataset.mode = endless ? 'endless' : 'campaign';
    const again = document.getElementById('again-btn');
    if (again) {
      again.innerHTML = endless
        ? '再次挑战 <span class="arrow">▶</span>'
        : (data.canNext ? '下一关 <span class="arrow">▶</span>' : '再来一局 <span class="arrow">▶</span>');
    }
    const menuBtn = document.getElementById('menu-btn');
    if (menuBtn) menuBtn.textContent = '返回选关';
    const panel = document.getElementById('result-screen');
    panel.classList.add('show');
    panel.dataset.place = endless ? 0 : place;
    panel.dataset.mode = endless ? 'endless' : 'campaign';
  }

  hideResult() {
    this.result.classList.remove('show');
  }

  showPause(v) {
    this.pause.classList.toggle('show', v);
  }

  reset() {
    this.lastRank = null;
    this.lastLap = null;
    this.intensity = 0;
    this.callout.classList.remove('show');
    this.countdownEl.classList.remove('show');
    this.startTip.classList.remove('show');
    this.result.classList.remove('show');
    this.pause.classList.remove('show');
    this.root.classList.remove('offroad');
    this.root.classList.remove('stunned');
    this.calloutTimer = 0;
    if (this.itemToastEl) this.itemToastEl.classList.remove('show');
    this.setItem(null);
    this.setShield(0);
  }
}
