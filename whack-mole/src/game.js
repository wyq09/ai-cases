window.WM = window.WM || {};
(() => {
  'use strict';
  const L = window.WM.LOGIC;
  if (!L) return;

  /* ================= 错误探针 ================= */
  window.__errs = window.__errs || [];
  window.addEventListener('error', e => { try { window.__errs.push(String(e && e.message || e)); } catch (_) {} });

  /* ================= 外部模块安全桥（缺模块零异常，busy 永不依赖外部回调） ================= */
  const ERRS = window.__errs;
  function safe(label, fn) {
    try { return fn(); } catch (e) { ERRS.push(label + ':' + (e && e.message || e)); return undefined; }
  }
  const has = k => !!(window.WM && window.WM[k]);
  const snd = {
    play(n, o) { if (st.muted) return; safe('audio.play', () => has('AUDIO') && window.WM.AUDIO.play(n, o)); },
    loop(name, on) { safe('audio.loop', () => has('AUDIO') && (on ? window.WM.AUDIO.startLoop(name) : window.WM.AUDIO.stopLoop(name))); },
    duck(ms) { safe('audio.duck', () => has('AUDIO') && window.WM.AUDIO.duck(ms)); },
    vols() {
      const v = cfg.vols || {};
      safe('audio.vol', () => {
        if (!has('AUDIO')) return;
        window.WM.AUDIO.setBGMVolume(v.bgm); window.WM.AUDIO.setSFXVolume(v.sfx); window.WM.AUDIO.setMasterVolume(st.muted ? 0 : v.master);
      });
    }
  };
  const art = {
    mole(id, pose) { return safe('art.mole', () => has('ART') ? window.WM.ART.mole(id, pose) : '') || ''; },
    one(name) { return safe('art.one', () => has('ART') ? window.WM.ART[name]() : '') || ''; },
    icon(name) { return safe('art.icon', () => has('ART') ? window.WM.ART.uiIcon(name) : '') || ''; },
    hammer(pose) { return safe('art.hammer', () => has('ART') ? window.WM.ART.hammer(pose) : '') || ''; }
  };
  const fx = {
    _c(k, args) { safe('fx.' + k, () => { if (has('FX') && window.WM.FX[k]) window.WM.FX[k].apply(window.WM.FX, args); }); },
    whackStar(x, y, c) { this._c('whackStar', [x, y, c]); },
    dust(x, y) { this._c('dust', [x, y]); },
    burst(x, y, o) { this._c('burst', [x, y, o]); },
    floatScore(x, y, t, o) { this._c('floatScore', [x, y, t, o]); },
    coinFly(x1, y1, x2, y2, o) { this._c('coinFly', [x1, y1, x2, y2, o]); },
    confetti(n) { this._c('confetti', [n]); },
    ring(x, y, c) { this._c('ring', [x, y, c]); },
    bigText(t, o) { this._c('bigText', [t, o]); },
    shake(el, ms) { this._c('shake', [el, ms]); },
    stopAll() { this._c('stopAll', []); }
  };

  /* ================= 配置与存档 ================= */
  let cfg = L.deepMerge(L.DEFAULT_CFG, L.loadJSON(L.LS_CFG) || {});
  let st = Object.assign({ best: {}, plays: {}, muted: false }, L.loadJSON(L.LS_ST) || {});
  // URL 覆盖（?diff= ?time= ?muted=1）
  try {
    const q = new URLSearchParams(location.search);
    if (q.get('diff') && L.DIFFS[q.get('diff')]) cfg.diff = q.get('diff');
    if (q.get('time')) cfg.timeLimit = L.clamp(parseInt(q.get('time'), 10) || cfg.timeLimit, 15, 300);
    if (q.get('muted') === '1') st.muted = true;
  } catch (e) {}
  const saveCfg = () => L.saveJSON(L.LS_CFG, cfg);
  const saveSt = () => L.saveJSON(L.LS_ST, st);
  const playsLeft = () => cfg.dailyLimit > 0 ? Math.max(0, cfg.dailyLimit - (st.plays[L.today()] || 0)) : Infinity;

  /* ================= DOM ================= */
  const $ = id => document.getElementById(id);
  const app = $('wm-app'), board = $('wm-board'), fxHost = $('wm-fx');
  const elTimeNum = $('wm-time-num'), elBar = $('wm-timebar-i'), elScore = $('wm-score'), elMaxCombo = $('wm-maxcombo');
  const elCombo = $('wm-combo'), elFrenzy = $('wm-frenzy'), elFrenzyNum = $('wm-frenzy-num');
  const elGiftN = $('wm-gift-n'), elTray = $('wm-tray-slots');
  const cover = $('wm-cover'), result = $('wm-result'), toastEl = $('wm-toast');
  const hammer = $('wm-hammer'), hammerImg = $('wm-hammer-img');
  const GIFT_SLOTS = 4;

  /* ================= 运行时状态 ================= */
  const R = {
    mode: 'cover',            // cover | playing | result
    diff: cfg.diff,
    score: 0, combo: 0, maxCombo: 0, hits: 0, whiffs: 0, gifts: 0,
    slots: new Array(9).fill(null),   // { id, upAt, hideAt, hit, autoAt }
    nextPopAt: 0, endAt: 0, frenzyUntil: 0, lastSec: -1,
    pausedAt: 0, paused: false,
    result: null,
    auto: false
  };
  const playing = () => R.mode === 'playing';
  const inFrenzy = ts => ts < R.frenzyUntil;

  /* ================= 小 UI ================= */
  let toastT = 0;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove('show'), 1800);
  }
  function copyText(text, okMsg) {
    const done = () => toast(okMsg || '已复制，去粘贴吧');
    const fallback = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta); done();
      } catch (e) { toast('复制失败'); }
    };
    safe('copy', () => {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
      else fallback();
    }) ;
  }

  /* ================= 场地搭建 ================= */
  const holeEls = [];
  function buildBoard() {
    board.innerHTML = '';
    holeEls.length = 0;
    for (let i = 0; i < 3; i++) {
      const t = document.createElement('img');
      t.className = 'tuft t' + i; t.alt = '';
      const src = safe('art.tuft', () => has('ART') && window.WM.ART.grassTuft(i)) || '';
      if (src) t.src = src;
      board.appendChild(t);
    }
    const t3 = document.createElement('img');
    t3.className = 'tuft t3'; t3.alt = '';
    const s3 = safe('art.tuft', () => has('ART') && window.WM.ART.grassTuft(2)) || '';
    if (s3) t3.src = s3;
    board.appendChild(t3);

    for (let i = 0; i < 9; i++) {
      const h = document.createElement('button');
      h.className = 'hole'; h.dataset.i = i;
      h.innerHTML = '<img class="hb" alt=""><div class="clip"><div class="mole down"><img class="mi" alt=""></div></div><img class="hf" alt="">';
      const hb = h.querySelector('.hb'), hf = h.querySelector('.hf');
      const bk = art.one('holeBack'), fr = art.one('holeFront');
      if (bk) hb.src = bk;
      if (fr) hf.src = fr;
      board.appendChild(h);
      holeEls.push(h);
    }
  }
  function moleSrc(id) {
    return (cfg.moles && cfg.moles[id]) || art.mole(id, 'up');
  }

  /* ================= 弹鼠调度 ================= */
  const jit = n => n * (0.75 + Math.random() * 0.5);   // ±25% 抖动
  function tryPop(now) {
    const D = L.DIFFS[R.diff];
    let active = 0;
    const free = [];
    for (let i = 0; i < 9; i++) {
      const s = R.slots[i];
      if (s) { if (!s.hit) active++; }
      else free.push(i);
    }
    const maxUp = Math.max(1, D.maxUp + (inFrenzy(now) ? 1 : 0));
    if (active < maxUp && free.length) {
      const hi = free[(Math.random() * free.length) | 0];
      const fz = inFrenzy(now);
      const id = L.pickMole(D.weights, fz);
      const stay = jit(D.popUp) * (fz ? 0.75 : 1);
      const slot = { id, upAt: now, hideAt: now + stay, hit: false, autoAt: 0 };
      if (R.auto && L.MOLES[id].whackable) slot.autoAt = now + (fz ? 200 + Math.random() * 120 : 260 + Math.random() * 200);
      R.slots[hi] = slot;
      const el = holeEls[hi], m = el.querySelector('.mole'), mi = el.querySelector('.mi');
      mi.src = moleSrc(id);
      m.classList.remove('down', 'whacked');
      m.classList.add('up');
      snd.play('pop');
    }
    R.nextPopAt = now + jit(D.gap) * (inFrenzy(now) ? 0.45 : 1);
  }
  function clearSlot(i, now) {
    const el = holeEls[i], m = el.querySelector('.mole');
    m.classList.remove('up', 'whacked');
    m.classList.add('down');
    R.slots[i] = null;
  }
  function retract(i, now) {
    const s = R.slots[i];
    if (!s) return;
    s.hideAt = now + 170;              // 缩回动画后再清位
    s.retreating = true;
    const el = holeEls[i], m = el.querySelector('.mole');
    m.classList.remove('up');
    m.classList.add('down');
  }

  /* ================= 锤击 ================= */
  function hammerStrike(clientX, clientY) {
    hammer.style.left = (clientX - 30) + 'px';
    hammer.style.top = (clientY - 58) + 'px';
    hammer.classList.add('show');
    hammer.classList.remove('strike');
    void hammer.offsetWidth;
    hammer.classList.add('strike');
    clearTimeout(hammer._t);
    hammer._t = setTimeout(() => hammer.classList.remove('show'), 650);
  }
  function holeCenter(i) {
    const r = holeEls[i].getBoundingClientRect(), a = app.getBoundingClientRect();
    return { x: r.left + r.width / 2 - a.left, y: r.top + r.height * 0.42 - a.top, cx: r.left + r.width / 2, cy: r.top + r.height * 0.42 };
  }
  function hitHole(i, clientX, clientY) {
    const now = performance.now();
    hammerStrike(clientX, clientY);
    if (!playing() || R.paused) return;
    const s = R.slots[i];
    if (s && !s.hit) {
      s.hit = true;
      s.hideAt = now + 380;
      const info = L.MOLES[s.id];
      const c = holeCenter(i);
      if (!info.whackable) {
        // 炸弹：扣分 + 清连击 + 抖屏
        R.score = Math.max(0, R.score + L.moleScore('bomb', cfg));
        R.combo = 0;
        safe('img.hit', () => { holeEls[i].querySelector('.mi').src = art.mole('bomb', 'hit'); });
        holeEls[i].querySelector('.mole').classList.add('whacked');
        snd.play('bomb'); fx.whackStar(c.x, c.y, '#8F2B20'); fx.shake(app, 320);
        fx.floatScore(c.x, c.y, L.moleScore('bomb', cfg) + '!', { color: '#B93A2B', size: 20 });
      } else {
        R.combo++;
        R.maxCombo = Math.max(R.maxCombo, R.combo);
        R.hits++;
        const mult = L.comboMult(R.combo, cfg.comboOn) * (inFrenzy(now) ? 2 : 1);
        const gain = Math.round(L.moleScore(s.id, cfg) * mult);
        R.score += gain;
        safe('img.hit', () => { holeEls[i].querySelector('.mi').src = art.mole(s.id, 'hit'); });
        holeEls[i].querySelector('.mole').classList.add('whacked');
        fx.whackStar(c.x, c.y, s.id === 'gold' ? '#E4B95B' : '#FFF9EE');
        fx.floatScore(c.x, c.y - 40, '+' + gain, { color: s.id === 'gold' ? '#C99A3C' : '#FFF9EE', size: s.id === 'gold' ? 21 : 17 });
        if (s.id === 'gold') snd.play('gold'); else snd.play('whack');
        // 连击里程碑提示音（3/6/10 档位跃迁时）
        const cm = R.combo === 3 ? 2 : R.combo === 6 ? 3 : R.combo === 10 ? 4 : 0;
        if (cm && cfg.comboOn) snd.play('combo', { level: cm });
        // 礼盒鼠：收集 + 狂热
        if (s.id === 'gift') {
          R.gifts++;
          snd.play('gift');
          updateTray(true, c);
          triggerFrenzy(now);
        }
      }
      updateHUD();
    } else {
      // 敲空
      R.whiffs++;
      snd.play('whiff');
      const c = holeCenter(i);
      fx.dust(c.x, c.y + 14);
    }
  }

  /* ================= 狂热时刻 ================= */
  function triggerFrenzy(now) {
    const retrigger = inFrenzy(now);
    R.frenzyUntil = now + cfg.frenzySec * 1000;
    R.frenzyOffDone = false;
    app.classList.add('frenzy');
    elFrenzy.hidden = false;
    if (!retrigger) {
      snd.play('frenzy');
      snd.duck(900);
      fx.bigText('狂热时刻!', { sub: '双倍得分 · 金鼠出没', dur: 1400 });
    }
  }
  function frenzyOff() {
    app.classList.remove('frenzy');
    elFrenzy.hidden = true;
  }

  /* ================= HUD ================= */
  function updateHUD() {
    elScore.textContent = R.score;
    elMaxCombo.textContent = R.maxCombo;
    if (R.combo >= 2 && cfg.comboOn) {
      elCombo.hidden = false;
      elCombo.textContent = '连击 ×' + R.combo;
      elCombo.classList.remove('pop'); void elCombo.offsetWidth; elCombo.classList.add('pop');
    } else {
      elCombo.hidden = true;
    }
    elGiftN.textContent = R.gifts;
  }
  function updateTray(animate, from) {
    const n = Math.min(R.gifts, GIFT_SLOTS);
    const giftIcon = (cfg.moles && cfg.moles.gift) || art.icon('gift');
    for (let i = 0; i < GIFT_SLOTS; i++) {
      const slot = elTray.children[i];
      if (!slot) continue;
      if (i < Math.min(R.gifts, GIFT_SLOTS)) {
        const img = slot.querySelector('img');
        if (img && !img.src) img.src = giftIcon;
        const multi = i === GIFT_SLOTS - 1 && R.gifts > GIFT_SLOTS;
        slot.querySelector('.xn').textContent = '×' + (R.gifts - GIFT_SLOTS + 1);
        slot.classList.toggle('multi', multi);
        if (!slot.classList.contains('got')) {
          slot.classList.add('got');
          if (animate && from) {
            const ar = app.getBoundingClientRect(), sr = slot.getBoundingClientRect();
            fx.coinFly(from.x, from.y, sr.left - ar.left + sr.width / 2, sr.top - ar.top + sr.height / 2, { n: 1, icon: giftIcon });
          }
        }
      }
    }
  }
  function resetTray() {
    elTray.innerHTML = '';
    for (let i = 0; i < GIFT_SLOTS; i++) {
      const d = document.createElement('div');
      d.className = 'slot';
      d.innerHTML = '<img alt=""><span class="xn"></span>';
      elTray.appendChild(d);
    }
  }

  /* ================= 主循环（rAF + setInterval 双驱动，时间戳调度） ================= */
  let rafId = 0;
  function frame() {
    const now = performance.now();
    if (!playing() || R.paused) return;
    // 收场
    if (now >= R.endAt) { endRound(); return; }
    // 弹鼠
    if (now >= R.nextPopAt) tryPop(now);
    // 缩回/清除
    for (let i = 0; i < 9; i++) {
      const s = R.slots[i];
      if (s && now >= s.hideAt) clearSlot(i, now);
    }
    // 狂热
    if (R.frenzyUntil) {
      if (inFrenzy(now)) {
        elFrenzyNum.textContent = Math.ceil((R.frenzyUntil - now) / 1000);
      } else if (!R.frenzyOffDone) {
        frenzyOff(); R.frenzyOffDone = true;
      }
    }
    // 自动演示
    if (R.auto) {
      for (let i = 0; i < 9; i++) {
        const s = R.slots[i];
        if (s && s.autoAt && !s.hit && now >= s.autoAt) { s.autoAt = 0; hitHole(i, holeCenter(i).cx, holeCenter(i).cy); }
      }
    }
    // 时间
    const remainMs = Math.max(0, R.endAt - now);
    const secLeft = Math.ceil(remainMs / 1000);
    if (secLeft !== R.lastSec) {
      R.lastSec = secLeft;
      elTimeNum.textContent = secLeft + 's';
      const frac = R.endAt > 0 ? remainMs / (cfg.timeLimit * 1000) : 1;
      elBar.style.width = (frac * 100).toFixed(1) + '%';
      elBar.className = secLeft <= 5 ? 'low' : (frac < 0.5 ? 'mid' : '');
      if (secLeft <= 5 && secLeft > 0) snd.play('tick');
    }
  }
  function onRaf() { rafId = 0; frame(); if (playing() && !R.paused && !rafId) rafId = requestAnimationFrame(onRaf); }
  function kick() { if (!rafId) rafId = requestAnimationFrame(onRaf); }
  setInterval(() => { if (playing() && !R.paused) frame(); }, 120);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseGame(); else resumeGame();
  });
  function pauseGame() {
    if (!playing() || R.paused) return;
    R.paused = true; R.pausedAt = performance.now();
  }
  function resumeGame() {
    if (!playing() || !R.paused) return;
    const shift = performance.now() - R.pausedAt;
    R.nextPopAt += shift; R.endAt += shift; R.frenzyUntil += shift;
    for (let i = 0; i < 9; i++) {
      const s = R.slots[i];
      if (s) { s.upAt += shift; s.hideAt += shift; if (s.autoAt) s.autoAt += shift; }
    }
    R.paused = false;
    R.nextPopAt += 350;                // 回到前台缓冲
    kick();
  }

  /* ================= 局流程 ================= */
  function start(diffKey) {
    const D = L.DIFFS[diffKey] ? diffKey : R.diff;
    if (playsLeft() <= 0) { toast('今日次数已用完，明天再来'); return false; }
    if (playing()) return false;
    R.diff = D;
    st.plays[L.today()] = (st.plays[L.today()] || 0) + 1; saveSt();
    R.mode = 'playing';
    R.score = 0; R.combo = 0; R.maxCombo = 0; R.hits = 0; R.whiffs = 0; R.gifts = 0;
    R.slots = new Array(9).fill(null);
    R.frenzyUntil = 0; R.frenzyOffDone = true; frenzyOff();
    R.lastSec = -1;
    const now = performance.now();
    R.endAt = now + cfg.timeLimit * 1000;
    R.nextPopAt = now + 650;
    resetTray(); updateHUD();
    elTimeNum.textContent = cfg.timeLimit + 's';
    elBar.style.width = '100%'; elBar.className = '';
    cover.hidden = true;
    result.hidden = true;
    snd.loop('bgm', true); snd.vols();
    fx.bigText('开始!', { dur: 800, scale: 0.8 });
    kick();
    return true;
  }
  function endRound() {
    if (!playing()) return;
    R.mode = 'result';
    const now = performance.now();
    for (let i = 0; i < 9; i++) if (R.slots[i]) clearSlot(i, now);
    frenzyOff();
    snd.loop('bgm', false);
    const acc = (R.hits + R.whiffs) > 0 ? R.hits / (R.hits + R.whiffs) : 0;
    const tierKey = L.tier(R.score, R.diff);
    R.result = {
      diff: R.diff, score: R.score, maxCombo: R.maxCombo, hits: R.hits,
      accuracy: Math.round(acc * 100) / 100,
      tier: tierKey, tierName: L.TIER_NAME[tierKey],
      gifts: R.gifts, claimed: false, code: null
    };
    // 平台钩子：返回 false 则平台接管，不弹内置结算
    let keep = true;
    safe('hook.onRoundEnd', () => {
      const h = window.WM.marketing && window.WM.marketing.hooks.onRoundEnd;
      if (h && h(R.result) === false) keep = false;
    });
    if (!keep) return;
    // 最佳纪录
    const b = st.best[R.diff] || (st.best[R.diff] = { score: 0, combo: 0, acc: 0 });
    const isNew = R.score > b.score;
    if (R.score > b.score) b.score = R.score;
    if (R.maxCombo > b.combo) b.combo = R.maxCombo;
    if (R.result.accuracy > b.acc) b.acc = R.result.accuracy;
    saveSt();
    showResult(isNew);
    // 自动演示：结算后循环开下一局
    if (R.auto) safe('auto.again', () => setTimeout(() => { if (R.auto && R.mode === 'result') start(R.diff); }, 2500));
  }
  function showResult(isNew) {
    const r = R.result;
    const medal = $('wm-medal');
    medal.textContent = r.tier === 'gold' ? '金' : r.tier === 'silver' ? '银' : '铜';
    medal.className = 'medal ' + r.tier;
    $('wm-tiername').textContent = r.tierName;
    $('wm-final-score').textContent = r.score;
    $('wm-newbest').hidden = !isNew;
    $('wm-r-combo').textContent = r.maxCombo;
    $('wm-r-acc').textContent = Math.round(r.accuracy * 100) + '%';
    $('wm-r-hits').textContent = r.hits;
    // 奖品行
    const g = $('wm-r-gifts');
    g.innerHTML = '';
    if (r.gifts > 0) {
      const cap = document.createElement('span'); cap.className = 'cap'; cap.textContent = '收集奖品';
      g.appendChild(cap);
      const icon = (cfg.moles && cfg.moles.gift) || art.icon('gift');
      const show = Math.min(r.gifts, 5);
      for (let i = 0; i < show; i++) {
        const im = document.createElement('img'); im.src = icon; im.alt = '奖品';
        g.appendChild(im);
      }
      if (r.gifts > 5) {
        const more = document.createElement('span'); more.className = 'cap'; more.textContent = '×' + r.gifts;
        g.appendChild(more);
      }
    } else {
      const none = document.createElement('span'); none.className = 'none'; none.textContent = '本局未敲中礼盒鼠';
      g.appendChild(none);
    }
    // 奖品档位文案 + 领奖按钮
    const prize = prizeByTier(r.tier);
    $('wm-prize-line').innerHTML = '评级 <b>' + r.tierName + '</b> · 可领<b>【' + (prize ? prize.name : '参与奖') + '】</b>';
    $('wm-btn-claim').textContent = r.claimed ? '复制券码' : '一键领取好礼';
    $('wm-code').hidden = true;
    result.hidden = false;
    snd.play('win');
    if (r.tier !== 'bronze') fx.confetti(r.tier === 'gold' ? 110 : 70);
    renderCoverMeta();
  }
  function prizeByTier(t) {
    const list = (cfg.marketing && cfg.marketing.prizes) || [];
    for (let i = 0; i < list.length; i++) if (list[i].tier === t) return list[i];
    return list[list.length - 1] || null;
  }

  /* ================= 领奖 / 分享 ================= */
  function claim() {
    const r = R.result;
    if (!r) return;
    if (r.claimed && r.code) { copyText(r.code + '（本地演示券码）'); return; }
    r.claimed = true;
    const prize = prizeByTier(r.tier);
    r.code = L.genCode(prize ? prize.prefix : 'WM');
    let keep = true;
    safe('hook.onClaim', () => {
      const h = window.WM.marketing && window.WM.marketing.hooks.onClaim;
      if (h && h(r) === false) keep = false;
    });
    if (keep) {
      $('wm-code').textContent = r.code;
      $('wm-code').hidden = false;
      $('wm-btn-claim').textContent = '复制券码';
      fx.confetti(90);
      fx.burst(app.clientWidth / 2, app.clientHeight * 0.42, { n: 40 });
      toast('好礼已领取，券码已生成');
    }
  }
  function share() {
    const r = R.result;
    if (!r) return;
    let keep = true;
    safe('hook.onShare', () => {
      const h = window.WM.marketing && window.WM.marketing.hooks.onShare;
      if (h && h(r) === false) keep = false;
    });
    if (!keep) return;
    const m = cfg.marketing || {};
    const text = '【' + (m.title || '欢乐打地鼠') + '】我用「' + (L.DIFFS[r.diff] || {}).name + '」难度拿下 ' + r.score +
      ' 分（' + r.tierName + '），最高连击 ×' + r.maxCombo + '！来游园会挑战我吧！';
    safe('share', () => {
      if (navigator.share) {
        navigator.share({ title: m.title || '欢乐打地鼠', text: text }).then(() => {}, () => {});
      } else {
        copyText(text, '战绩已复制，去炫耀吧');
      }
    });
  }

  /* ================= 封面 ================= */
  function selectedDiff() {
    const on = cover.querySelector('#wm-diff button.on');
    return on ? on.dataset.diff : cfg.diff;
  }
  function renderCover() {
    const m = cfg.marketing || {};
    $('wm-title').innerHTML = esc(m.title || '欢乐打地鼠') + '<small>' + esc(m.subtitle || '游园会 · 赢好礼') + '</small>';
    $('wm-cover-title').textContent = m.title || '欢乐打地鼠';
    $('wm-cover-subtitle').textContent = m.subtitle || '游园会 · 赢好礼';
    $('wm-cover-rules').textContent = m.rules || '';
    const sup = $('wm-support');
    if (m.supportUrl) { sup.hidden = false; sup.textContent = '活动详情 / 联系客服'; sup.href = m.supportUrl; }
    else sup.hidden = true;
    const dl = $('wm-diff');
    for (const b of dl.querySelectorAll('button')) b.classList.toggle('on', b.dataset.diff === R.diff);
    renderCoverMeta();
  }
  function renderCoverMeta() {
    const b = st.best[R.diff];
    $('wm-best').innerHTML = b && b.score > 0
      ? '最佳纪录：<b>' + b.score + ' 分</b> · 连击 ×' + b.combo + ' · 命中 ' + Math.round(b.acc * 100) + '%'
      : '本难度暂无纪录，来创造第一个！';
    const left = playsLeft();
    $('wm-plays').innerHTML = cfg.dailyLimit > 0
      ? '今日剩余次数：<b>' + left + '</b> / ' + cfg.dailyLimit
      : '今日不限次数，玩到尽兴';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  /* ================= 营销接入层 ================= */
  window.WM.marketing = {
    hooks: { onRoundEnd: null, onClaim: null, onShare: null },
    register(opts) {
      opts = opts || {};
      if (opts.hooks) {
        for (const k of ['onRoundEnd', 'onClaim', 'onShare']) {
          if (typeof opts.hooks[k] === 'function') this.hooks[k] = opts.hooks[k];
        }
      }
      const rest = Object.assign({}, opts);
      delete rest.hooks;
      if (Object.keys(rest).length) {
        cfg.marketing = L.deepMerge(cfg.marketing, rest);
        saveCfg();
        renderCover();
      }
      return true;
    }
  };

  /* ================= 配置面板 ================= */
  function mountPanel() {
    safe('panel.mount', () => {
      if (!has('CONFIG_PANEL')) return;
      window.WM.CONFIG_PANEL.mount($('wm-cfg-host'));
      window.WM.CONFIG_PANEL.onChange(snap => {
        if (snap && snap.__clearBest) { st.best = {}; saveSt(); renderCoverMeta(); toast('最佳纪录已清除'); return; }
        if (!snap) return;
        cfg = L.deepMerge(L.DEFAULT_CFG, snap);
        saveCfg();
        snd.vols();
        renderCover();
      });
    });
  }

  /* ================= 事件接线 ================= */
  function wire() {
    // 场地锤击（pointerdown 全洞判定）
    board.addEventListener('pointerdown', e => {
      const h = e.target.closest('.hole');
      if (!h) { hammerStrike(e.clientX, e.clientY); return; }
      hitHole(+h.dataset.i, e.clientX, e.clientY);
    });
    // 封面
    $('wm-diff').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      R.diff = b.dataset.diff;
      for (const x of $('wm-diff').querySelectorAll('button')) x.classList.toggle('on', x === b);
      renderCoverMeta();
      snd.play('click');
    });
    $('wm-btn-start').addEventListener('click', () => { snd.play('click'); start(selectedDiff()); });
    // 结算
    $('wm-btn-claim').addEventListener('click', () => { snd.play('click'); claim(); });
    $('wm-btn-share').addEventListener('click', () => { snd.play('click'); share(); });
    $('wm-btn-again').addEventListener('click', () => {
      snd.play('click');
      if (!start(R.diff)) { R.mode = 'cover'; result.hidden = true; cover.hidden = false; }
    });
    // 顶栏
    $('wm-btn-sound').addEventListener('click', () => {
      st.muted = !st.muted; saveSt();
      renderSoundIcon(); snd.vols();
      if (st.muted) snd.loop('bgm', false);
      else if (playing()) snd.loop('bgm', true);
      snd.play('click');
    });
    $('wm-btn-cfg').addEventListener('click', () => {
      snd.play('click');
      if (has('CONFIG_PANEL')) {
        pauseGame();
        window.WM.CONFIG_PANEL.open();
      } else toast('配置面板未加载');
    });
    // 面板关闭恢复计时：config-panel 派发 wmcp-closed 事件 + isOpen 轮询双兜底
    setInterval(() => {
      if (R.paused && playing() && has('CONFIG_PANEL') && window.WM.CONFIG_PANEL.isOpen && !window.WM.CONFIG_PANEL.isOpen()) resumeGame();
    }, 400);
  }
  function renderSoundIcon() {
    const b = $('wm-btn-sound');
    b.innerHTML = '<img alt="声音">';
    b.querySelector('img').src = art.icon(st.muted ? 'soundOff' : 'sound');
    const c = $('wm-btn-cfg');
    c.innerHTML = '<img alt="设置">';
    c.querySelector('img').src = art.icon('cfg');
  }
  // config-panel 关闭事件兜底派发（面板内部若未派发，用 isOpen 轮询已覆盖；此处兼容事件名）
  document.addEventListener('wmcp-closed', () => resumeGame());

  /* ================= 自动演示 ================= */
  function setAuto(on) {
    R.auto = !!on;
    if (on && R.mode === 'cover') setTimeout(() => start(R.diff), 500);
  }

  /* ================= 测试钩子 ================= */
  Object.defineProperty(window, '__wm', {
    value: {
      version: '1.0.0',
      get state() { return { mode: R.mode, diff: R.diff, score: R.score, combo: R.combo, maxCombo: R.maxCombo, hits: R.hits, whiffs: R.whiffs, gifts: R.gifts, slots: R.slots.map(s => s ? { id: s.id, hit: s.hit } : null), result: R.result, auto: R.auto, paused: R.paused, errs: ERRS }; },
      get cfg() { return cfg; },
      get busy() { return playing(); },
      start,
      whack(i) { const c = holeCenter(i); hitHole(i, c.cx, c.cy); },
      auto: setAuto,
      setMuted(b) { st.muted = !!b; saveSt(); renderSoundIcon(); snd.vols(); },
      spawn(i, id, ms) {
        if (!playing()) return false;
        const now = performance.now();
        R.slots[i] = { id, upAt: now, hideAt: now + (ms || 900), hit: false, autoAt: 0 };
        const el = holeEls[i], m = el.querySelector('.mole');
        el.querySelector('.mi').src = moleSrc(id);
        m.classList.remove('down', 'whacked');
        m.classList.add('up');
        return true;
      }
    }
  });

  /* ================= 启动 ================= */
  function boot() {
    try {
    // 印章
    const sealSrc = art.one('seal');
    for (const id of ['wm-seal', 'wm-cover-seal']) {
      const el = $(id);
      if (sealSrc) { el.innerHTML = '<img alt="印">'; el.querySelector('img').src = sealSrc; }
      else el.textContent = '鼠';
    }
    hammerImg.src = art.hammer('idle') || '';
    const foot = $('wm-cover-foot');
    if (foot) {
      for (let i = 0; i < 3; i++) {
        const im = document.createElement('img');
        im.alt = '';
        const g = safe('art.tuft.cover', () => has('ART') ? window.WM.ART.grassTuft(i) : '') || '';
        if (g) im.src = g;
        foot.appendChild(im);
      }
    }
    fxHost.innerHTML = '';
    safe('fx.init', () => { if (has('FX')) window.WM.FX.init(fxHost); });
    buildBoard();
    resetTray();
    renderSoundIcon();
    renderCover();
    mountPanel();
    wire();
    snd.vols();
    try {
      if (new URLSearchParams(location.search).get('auto') === '1') setAuto(true);
    } catch (e) {}
    } catch (e) { ERRS.push('boot:' + (e && e.message || e)); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
