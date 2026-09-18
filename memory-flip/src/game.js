/* ===== 翻牌赢好礼 · game.js —— 状态机/翻牌引擎/结算/持久化（主线） ===== */
window.MF = window.MF || {};
MF.GAME = (() => {
  const L = MF.LOGIC;
  const $ = id => document.getElementById(id);

  /* ---- 可缺模块 NOOP 兜底（子代理模块未就绪时游戏必须能跑） ---- */
  const noop = function () {};
  function NOOP(base) {
    return new Proxy(base || {}, { get: (t, k) => (k in t ? t[k] : noop) });
  }
  function phSVG(inner, bg) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
      '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" rx="12" fill="' + bg + '"/><rect x="6" y="6" width="88" height="88" rx="8" fill="none" stroke="#3A2E24" stroke-width="3"/>' + inner + '</svg>');
  }
  function phIcon(id) {
    const ch = (L.ICON_NAME[id] || '?').slice(0, 1);
    return phSVG('<circle cx="50" cy="50" r="25" fill="#FFF9EE" stroke="#B93A2B" stroke-width="3"/><text x="50" y="61" font-size="30" text-anchor="middle" fill="#8F2B20" font-family="serif" font-weight="bold">' + ch + '</text>', '#F4D8A8');
  }
  function phBack() {
    return phSVG('<circle cx="50" cy="50" r="22" fill="none" stroke="#E4B95B" stroke-width="3"/><text x="50" y="61" font-size="28" text-anchor="middle" fill="#E4B95B" font-family="serif" font-weight="bold">礼</text>', '#A93426');
  }
  const A = () => window.MF.ART || NOOP({ card: phIcon, back: phBack, trayIcon: phIcon });
  const U = () => window.MF.AUDIO || NOOP();
  const X = () => window.MF.FX || NOOP();

  /* ---- 配置与存档 ---- */
  function loadJSON(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  let cfg = L.deepMerge(L.defaultCfg(), loadJSON(L.LS_CFG));
  // 契约约定：面板 open() 读 window.MF.cfg —— 用 getter 发布，onChange 换引用后自动同步
  try { Object.defineProperty(MF, 'cfg', { get: () => cfg, configurable: true }); } catch (e) {}
  const st = Object.assign({ best: {}, plays: {}, muted: false }, loadJSON(L.LS_ST) || {});
  const saveSt = () => { try { localStorage.setItem(L.LS_ST, JSON.stringify(st)); } catch (e) {} };
  const saveCfg = () => { try { localStorage.setItem(L.LS_CFG, JSON.stringify(cfg)); } catch (e) {} };

  // URL 参数覆盖（不落盘）
  const GRID_KEYS = Object.keys(L.GRIDS);
  if (GRID_KEYS.includes(L.Q.get('grid'))) cfg.grid = L.Q.get('grid');
  const qt = parseInt(L.Q.get('time'), 10); if (!isNaN(qt)) cfg.timeLimit = L.clamp(qt, 0, 600);
  const qp = parseFloat(L.Q.get('peek')); if (!isNaN(qp)) cfg.peekSec = L.clamp(qp, 0, 10);

  /* ---- 局内状态 ---- */
  const S = {
    phase: 'cover',            // cover | peek | play | result
    grid: cfg.grid, deck: [], open: [], matchedSet: {}, matched: 0,
    moves: 0, score: 0, combo: 0, maxCombo: 0,
    busy: false, startedAt: 0, deadline: 0, lastTickSec: null,
    trayIcons: [], result: null, auto: false, selGrid: cfg.grid,
  };
  const mem = {};              // 自动演示的记忆：id -> [idx]

  /* ---- DOM ---- */
  const app = $('mf-app'), board = $('mf-board'), cover = $('mf-cover');
  const elMoves = $('mf-moves'), elScore = $('mf-score'), elCombo = $('mf-combo'), elComboN = $('mf-combo-n');
  const elBar = $('mf-timebar'), elTime = $('mf-time-num');
  const trayRow = $('mf-tray-row'), resultEl = $('mf-result'), toastEl = $('mf-toast');
  const ICON_SND_ON = '<svg viewBox="0 0 24 24" fill="none"><path d="M11 5 6.4 9H3.4v6h3L11 19z" fill="#B93A2B" stroke="#3A2E24" stroke-width="1.8" stroke-linejoin="round"/><path d="M15 8.6a4.6 4.6 0 0 1 0 6.8M17.8 6.2a8.2 8.2 0 0 1 0 11.6" stroke="#2B2622" stroke-width="2" stroke-linecap="round"/></svg>';
  const ICON_SND_OFF = '<svg viewBox="0 0 24 24" fill="none"><path d="M11 5 6.4 9H3.4v6h3L11 19z" fill="#B7A893" stroke="#3A2E24" stroke-width="1.8" stroke-linejoin="round"/><path d="M15.6 9.4l5.2 5.2M20.8 9.4l-5.2 5.2" stroke="#8F2B20" stroke-width="2.2" stroke-linecap="round"/></svg>';
  const ICON_GEAR = '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3.4" fill="#B93A2B" stroke="#3A2E24" stroke-width="1.8"/><path d="M12 2.6v2.8M12 18.6v2.8M2.6 12h2.8M18.6 12h2.8M5.3 5.3l2 2M16.7 16.7l2 2M18.7 5.3l-2 2M7.3 16.7l-2 2" stroke="#2B2622" stroke-width="2" stroke-linecap="round"/></svg>';
  const STAR = '<svg viewBox="0 0 24 24"><path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9z"/></svg>';

  let toastTimer = 0;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1900);
  }

  /* ---- 音频接线 ---- */
  function applyVolumes() {
    const a = U();
    a.setMasterVolume(st.muted ? 0 : cfg.vols.master);
    a.setBGMVolume(cfg.vols.bgm); a.setSFXVolume(cfg.vols.sfx);
  }
  function firstGestureUnlock() { try { U().unlock(); } catch (e) {} }
  ['pointerdown', 'touchend', 'keydown'].forEach(ev =>
    document.addEventListener(ev, firstGestureUnlock, { passive: true }));

  function frontSrc(id) { return (cfg.icons && cfg.icons[id]) || A().card(id) || phIcon(id); }
  function traySrc(id) { return (cfg.icons && cfg.icons[id]) || A().trayIcon(id) || A().card(id) || phIcon(id); }
  function backSrc() { return A().back() || phBack(); }

  /* ---- 封面 ---- */
  function playsLeft() {
    if (!cfg.dailyLimit) return Infinity;
    return Math.max(0, cfg.dailyLimit - (st.plays[L.today()] || 0));
  }
  function renderCover() {
    const diff = $('mf-diff'); diff.innerHTML = '';
    GRID_KEYS.forEach(k => {
      const g = L.GRIDS[k];
      const b = document.createElement('button');
      b.innerHTML = g.label + '<small>' + g.cols + '×' + g.rows + ' · ' + g.pairs + '对</small>';
      if (k === S.selGrid) b.classList.add('on');
      b.onclick = () => { S.selGrid = k; cfg.grid = k; saveCfg(); U().play('click'); renderCover(); };
      diff.appendChild(b);
    });
    const best = st.best[S.selGrid];
    $('mf-best').innerHTML = best
      ? '本难度最佳：<b>' + best.score + ' 分</b> · 用时 ' + L.fmtTime(best.time) + ' · ' + best.stars + ' 星'
      : '本难度暂无纪录，快来开创纪录';
    const left = playsLeft();
    $('mf-plays').innerHTML = cfg.dailyLimit
      ? (left > 0 ? '今日还可挑战 <b>' + left + '</b> 次' : '今日次数已用完，明天再来')
      : '';
    $('mf-btn-start').disabled = left <= 0;
  }

  /* ---- 开局 ---- */
  function start(grid) {
    if (S.phase === 'peek' || S.phase === 'play') return false;
    const g = GRID_KEYS.includes(grid) ? grid : S.selGrid;
    if (playsLeft() <= 0) { toast('今日次数已用完，明天再来'); return false; }
    st.plays[L.today()] = (st.plays[L.today()] || 0) + 1; saveSt();
    S.selGrid = g; cfg.grid = g; saveCfg();

    S.grid = g; S.deck = L.dealPairs(g);
    S.open = []; S.matchedSet = {}; S.matched = 0; S.moves = 0; S.score = 0;
    S.combo = 0; S.maxCombo = 0; S.busy = true; S.deadline = 0; S.lastTickSec = null;
    S.trayIcons = []; S.result = null; S.phase = 'peek';
    for (const k in mem) delete mem[k];

    cover.classList.add('off');
    buildTray(); buildBoard();
    elBar.style.width = '100%'; elBar.classList.remove('low');
    elTime.textContent = cfg.timeLimit > 0 ? cfg.timeLimit + 's' : '0s';
    updHUD(); renderCover();

    U().play('click');
    try { U().startLoop('bgm'); } catch (e) {}

    const go = () => {
      S.phase = 'play'; S.startedAt = Date.now();
      S.deadline = cfg.timeLimit > 0 ? S.startedAt + cfg.timeLimit * 1000 : 0;
      S.busy = false;
    };
    const peekMs = (cfg.peekSec > 0 ? cfg.peekSec : 0) * 1000;
    if (peekMs > 0) {
      board.querySelectorAll('.card').forEach(c => c.classList.add('peek'));
      X().bigText('记住卡面！', { sub: '开局记忆时间', dur: Math.max(900, peekMs - 200) });
      setTimeout(() => {
        board.querySelectorAll('.card').forEach(c => c.classList.remove('peek'));
        go();
      }, peekMs);
    } else { go(); }
    return true;
  }

  function buildBoard() {
    const g = L.GRIDS[S.grid];
    board.style.setProperty('--cols', g.cols);
    board.innerHTML = '';
    const back = backSrc();
    S.deck.forEach((id, i) => {
      const c = document.createElement('button');
      c.className = 'card'; c.dataset.i = i; c.setAttribute('aria-label', '卡牌');
      c.innerHTML =
        '<div class="card-inner">' +
        '<div class="face back"><img src="' + back + '" alt=""></div>' +
        '<div class="face front"><img src="' + frontSrc(id) + '" alt="' + (L.ICON_NAME[id] || id) + '"></div>' +
        '</div>';
      c.addEventListener('click', () => flip(i));
      board.appendChild(c);
    });
    // 同步计算即可：clientWidth 读取会强制布局，不依赖渲染帧（后台标签 rAF 会被挂起）
    fitBoard();
    requestAnimationFrame(fitBoard); // 布局稳定后二次校准（字体/滚动条等次生变化）
  }

  // 卡牌尺寸双向约束：宽（列数）与高（行数）取小者，保持 3:4 且总高不出牌桌
  function fitBoard() {
    if (!S.deck.length) return;
    const g = L.GRIDS[S.grid];
    const cs = getComputedStyle(board);
    const availW = board.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const availH = board.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const gap = parseFloat(cs.columnGap) || 10;
    const w = Math.floor(Math.min(
      (availW - (g.cols - 1) * gap) / g.cols,
      ((availH - (g.rows - 1) * gap) / g.rows) * 3 / 4
    ));
    board.style.setProperty('--cw', Math.max(w, 36) + 'px');
    board.style.setProperty('--ch', Math.round(Math.max(w, 36) * 4 / 3) + 'px');
  }
  window.addEventListener('resize', fitBoard);
  function buildTray() {
    const g = L.GRIDS[S.grid];
    trayRow.innerHTML = '<span class="cap">好礼 <b id="mf-tray-cap">0/' + g.pairs + '</b></span>';
    for (let i = 0; i < g.pairs; i++) {
      const s = document.createElement('span');
      s.className = 'slot'; s.dataset.slot = i;
      s.innerHTML = '<img alt="" hidden>';
      trayRow.appendChild(s);
    }
  }
  function refreshCardImages() {
    const back = backSrc();
    board.querySelectorAll('.card').forEach(c => {
      const i = +c.dataset.i;
      c.querySelector('.face.back img').src = back;
      c.querySelector('.face.front img').src = frontSrc(S.deck[i]);
    });
  }

  /* ---- HUD ---- */
  function updHUD() {
    elMoves.textContent = S.moves;
    elScore.textContent = S.score;
    if (S.combo >= 2 && cfg.comboOn) {
      elCombo.hidden = false; elComboN.textContent = Math.min(S.combo, 9);
      elCombo.classList.remove('pop'); void elCombo.offsetWidth; elCombo.classList.add('pop');
    } else { elCombo.hidden = true; }
  }
  function tickTimer() {
    if (S.phase !== 'play') return;
    const now = Date.now();
    if (S.deadline) {
      const total = cfg.timeLimit * 1000;
      const leftMs = Math.max(0, S.deadline - now);
      const leftS = leftMs / 1000;
      elBar.style.width = (leftMs / total * 100) + '%';
      elBar.classList.toggle('low', leftS <= 5.05);
      const disp = Math.ceil(leftS);
      elTime.textContent = disp + 's';
      if (leftS <= 5.05 && disp !== S.lastTickSec && disp > 0) {
        S.lastTickSec = disp; U().play('tick');
      }
      if (leftMs <= 0) finish(false);
    } else {
      elBar.style.width = '100%'; elBar.classList.remove('low');
      elTime.textContent = Math.floor((now - S.startedAt) / 1000) + 's';
    }
  }
  setInterval(tickTimer, 200);

  /* ---- 翻牌 ---- */
  function cardEl(i) { return board.querySelector('.card[data-i="' + i + '"]'); }
  function centerOf(i) {
    const r = cardEl(i).getBoundingClientRect(), h = $('mf-fx').getBoundingClientRect();
    return { x: r.left - h.left + r.width / 2, y: r.top - h.top + r.height / 2 };
  }
  function flip(i) {
    if (S.phase !== 'play' || S.busy) return;
    const el = cardEl(i);
    if (!el || el.classList.contains('open') || S.matchedSet[i]) return;
    el.classList.add('open');
    U().play('flip');
    if (S.auto) { (mem[S.deck[i]] = mem[S.deck[i]] || []).push(i); }
    S.open.push(i);
    if (S.open.length < 2) return;

    const [a, b] = S.open;
    S.moves++; S.busy = true; updHUD();
    if (S.deck[a] === S.deck[b]) onMatch(a, b); else onMiss(a, b);
  }

  function onMatch(a, b) {
    S.combo++; S.maxCombo = Math.max(S.maxCombo, S.combo);
    const pts = L.pairScore(cfg.baseScore, S.combo, cfg.comboOn);
    S.score += pts;
    S.matchedSet[a] = S.matchedSet[b] = true;
    S.matched++;
    const id = S.deck[a];
    S.trayIcons.push(id);

    [a, b].forEach(i => {
      const el = cardEl(i);
      el.classList.add('matched', 'hit');
      setTimeout(() => el.classList.remove('hit'), 400);
    });

    U().play('match');
    if (cfg.comboOn && S.combo >= 2) {
      U().play('combo', { level: Math.min(S.combo, 4) });
      X().bigText('连击×' + Math.min(S.combo, 9), { sub: '奖励 ×' + L.comboMult(S.combo, true), dur: 950 });
    }
    const c = centerOf(b);
    X().burst(c.x, c.y, { n: 16, colors: ['#C99A3C', '#E4B95B', '#B93A2B', '#FFF9EE'] });
    const slot = trayRow.querySelector('.slot[data-slot="' + (S.matched - 1) + '"]');
    if (slot) {
      const sr = slot.getBoundingClientRect(), h = $('mf-fx').getBoundingClientRect();
      X().coinFly(c.x, c.y, sr.left - h.left + sr.width / 2, sr.top - h.top + sr.height / 2,
        { n: 3, icon: traySrc(id) });
      setTimeout(() => {
        const img = slot.querySelector('img');
        img.src = traySrc(id); img.hidden = false;
        slot.classList.add('got');
        const cap = $('mf-tray-cap'); if (cap) cap.textContent = S.matched + '/' + L.GRIDS[S.grid].pairs;
      }, 430);
    }

    updHUD();
    S.open = [];
    const total = L.GRIDS[S.grid].pairs;
    setTimeout(() => {
      S.busy = false;
      if (S.matched >= total) finish(true);
    }, 400);
  }

  function onMiss(a, b) {
    S.combo = 0; updHUD();
    U().play('miss');
    [a, b].forEach(i => cardEl(i).classList.add('wrong'));
    setTimeout(() => {
      [a, b].forEach(i => {
        const el = cardEl(i);
        if (el) { el.classList.remove('open', 'wrong'); }
      });
      S.open = []; S.busy = false;
    }, 780);
  }

  /* ---- 结算 ---- */
  function finish(win) {
    if (S.phase !== 'play') return;
    S.phase = 'result'; S.busy = false;
    const timeS = Math.max(1, Math.round((Date.now() - S.startedAt) / 1000));
    if (win && S.deadline) {
      const bonus = Math.round(Math.max(0, (S.deadline - Date.now()) / 1000)) * cfg.timeBonus;
      if (bonus > 0) { S.score += bonus; toast('时间奖励 +' + bonus); }
    }
    const total = L.GRIDS[S.grid].pairs;
    const stars = win ? L.stars(total, S.moves) : 0;
    S.result = {
      win, score: S.score, stars, time: timeS, moves: S.moves,
      maxCombo: S.maxCombo, pairs: S.matched, totalPairs: total,
      claimed: false, code: null,
    };
    if (win) {
      const best = st.best[S.grid] || (st.best[S.grid] = {});
      if (!best.score || S.score > best.score) best.score = S.score;
      if (!best.time || timeS < best.time) best.time = timeS;
      if (!best.combo || S.maxCombo > best.combo) best.combo = S.maxCombo;
      if (!best.stars || stars > best.stars) best.stars = stars;
      saveSt();
      U().play('win');
      X().confetti(150);
      X().bigText('挑战成功！', { sub: '好礼全部集齐', dur: 1400 });
    } else {
      U().play('lose');
      X().bigText('时间到！', { sub: '差一点点，再试试', dur: 1300, color: '#8F2B20' });
      board.querySelectorAll('.card.open').forEach(c => c.classList.remove('open'));
      S.open = [];
    }
    renderCover();
    setTimeout(showResult, win ? 950 : 700);
  }

  function genCode() {
    const cs = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let c = 'MF-';
    for (let s = 0; s < 2; s++) {
      if (s) c += '-';
      for (let i = 0; i < 4; i++) c += cs[Math.floor(Math.random() * cs.length)];
    }
    return c;
  }

  function showResult() {
    const r = S.result; if (!r) return;
    $('mf-rt').textContent = r.win ? '活 动 结 果' : '本 局 结 果';
    $('mf-rt-title').textContent = r.win ? '挑战成功' : '差一点点';
    const starRow = $('mf-stars');
    starRow.innerHTML = '';
    if (r.win) {
      for (let i = 0; i < 3; i++) {
        const sp = document.createElement('span');
        sp.className = 'st' + (i < r.stars ? ' on' : '');
        sp.style.animationDelay = (0.15 + i * 0.18) + 's';
        sp.innerHTML = STAR;
        starRow.appendChild(sp);
      }
      starRow.style.display = 'flex';
    } else starRow.style.display = 'none';
    starRow.querySelectorAll('.st').forEach(s => {
      if (!s.classList.contains('on')) s.querySelector('svg path').style.fill = '#D8CCB8';
    });

    $('mf-r-score').textContent = r.score;
    $('mf-rows').innerHTML =
      '<div><span>用时</span><b>' + L.fmtTime(r.time) + '</b></div>' +
      '<div><span>翻牌步数</span><b>' + r.moves + '</b></div>' +
      '<div><span>最高连击</span><b>×' + Math.max(r.maxCombo, 1) + '</b></div>' +
      '<div><span>收集好礼</span><b>' + r.pairs + ' / ' + r.totalPairs + ' 对</b></div>';

    const pz = $('mf-prizes');
    pz.innerHTML = '';
    if (r.pairs > 0) {
      S.trayIcons.forEach(id => {
        const img = document.createElement('img');
        img.src = traySrc(id); img.alt = L.ICON_NAME[id] || id;
        pz.appendChild(img);
      });
    }
    if (!r.win) {
      const lack = document.createElement('span');
      lack.className = 'lack';
      lack.textContent = '还差 ' + (r.totalPairs - r.pairs) + ' 件好礼';
      pz.appendChild(lack);
    }

    const codeEl = $('mf-code');
    codeEl.hidden = true; codeEl.textContent = '';
    $('mf-btn-claim').hidden = !r.win;
    $('mf-btn-claim').textContent = '一键领取好礼';
    $('mf-btn-share').hidden = !r.win;
    $('mf-btn-again').textContent = r.win ? '再来一局' : '再挑战一次';
    resultEl.hidden = false;
    if (r.claimed) applyClaimed();
  }

  function applyClaimed() {
    const r = S.result; if (!r) return;
    $('mf-btn-claim').textContent = '复制券码';
    const codeEl = $('mf-code');
    codeEl.hidden = false; codeEl.textContent = r.code || '';
  }

  function claim() {
    const r = S.result; if (!r || !r.win) return;
    if (!r.claimed) {
      r.claimed = true; r.code = genCode();
      applyClaimed();
      X().confetti(90); U().play('win');
      toast('好礼已领取，券码已生成');
    } else {
      copyText('MF-券码 ' + (r.code || '') + '（本地演示券码）');
    }
  }

  function copyText(t) {
    const done = () => toast('已复制，去粘贴吧');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(done, () => fallbackCopy(t, done));
    } else fallbackCopy(t, done);
  }
  function fallbackCopy(t, done) {
    const ta = document.createElement('textarea');
    ta.value = t; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('复制失败'); }
    ta.remove();
  }
  function share() {
    const r = S.result; if (!r) return;
    copyText('我在「翻牌赢好礼」记忆翻牌挑战中，用 ' + r.moves + ' 步集齐 ' + r.totalPairs +
      ' 件好礼，拿下 ' + r.score + ' 分、' + r.stars + ' 星评价！你能比我更快吗？');
  }

  /* ---- 自动演示（AI 带记忆贪心） ---- */
  let lastAuto = 0;
  setInterval(() => {
    if (!S.auto) return;
    if (S.phase === 'result' || S.phase === 'cover') { S.auto = false; return; }
    if (S.phase !== 'play' || S.busy) return;
    const now = Date.now();
    if (now - lastAuto < 580) return;

    const seen = {}; const total = S.deck.length;
    for (const id in mem) mem[id].forEach(i => { seen[i] = id; });
    const isMatched = i => S.matchedSet[i];
    // 已知对优先（去重：同一张卡可能被记忆多次）
    for (const id in mem) {
      const idxs = Array.from(new Set(mem[id])).filter(i => !isMatched(i));
      if (idxs.length >= 2) {
        lastAuto = now; flip(idxs[0]);
        setTimeout(() => flip(idxs[1]), 500);
        return;
      }
    }
    // 翻未知牌
    const unknown = [];
    for (let i = 0; i < total; i++) if (!isMatched(i) && !seen[i] && !S.open.includes(i)) unknown.push(i);
    const pool = unknown.length ? unknown : [];
    if (!pool.length) {
      for (let i = 0; i < total; i++) if (!isMatched(i) && !S.open.includes(i)) pool.push(i);
    }
    if (pool.length) { lastAuto = now; flip(pool[Math.floor(Math.random() * pool.length)]); }
  }, 140);

  /* ---- 按钮接线 ---- */
  $('mf-btn-start').addEventListener('click', () => start());
  $('mf-btn-again').addEventListener('click', () => {
    U().play('click'); resultEl.hidden = true; S.auto = false; S.phase = 'cover';
    renderCover();
    cover.classList.remove('off');
  });
  $('mf-btn-claim').addEventListener('click', claim);
  $('mf-btn-share').addEventListener('click', share);
  const btnSnd = $('mf-btn-sound'), btnCfg = $('mf-btn-cfg');
  function renderSnd() { btnSnd.innerHTML = st.muted ? ICON_SND_OFF : ICON_SND_ON; }
  btnSnd.addEventListener('click', () => {
    st.muted = !st.muted; saveSt(); applyVolumes(); renderSnd();
    toast(st.muted ? '已静音' : '声音已开启');
    if (!st.muted) U().play('click');
  });
  btnCfg.innerHTML = ICON_GEAR;
  btnCfg.addEventListener('click', () => {
    U().play('click');
    if (window.MF && MF.CONFIG_PANEL && MF.CONFIG_PANEL.mounted) MF.CONFIG_PANEL.open();
    else if (window.MF && MF.CONFIG_PANEL) MF.CONFIG_PANEL.open();
    else toast('配置面板未就绪');
  });
  renderSnd();

  /* ---- 配置面板接线 ---- */
  if (window.MF.CONFIG_PANEL) {
    try {
      MF.CONFIG_PANEL.mount($('mf-cfg-host'));
      MF.CONFIG_PANEL.onChange(nc => {
        cfg = nc; saveCfg();
        applyVolumes();
        try { U().applyOverrides(cfg.sounds || {}); } catch (e) {}
        refreshCardImages();
        if (!GRID_KEYS.includes(cfg.grid)) cfg.grid = '4x4';
        S.selGrid = cfg.grid;
        renderCover();
      });
      if (MF.CONFIG_PANEL.onClearBest) {
        MF.CONFIG_PANEL.onClearBest(() => {
          st.best = {}; saveSt(); renderCover(); toast('最佳纪录已清除');
        });
      }
    } catch (e) { /* 面板异常不阻塞游戏 */ }
  }
  applyVolumes();
  try { U().applyOverrides(cfg.sounds || {}); } catch (e) {}
  try { MF.FX.init($('mf-fx')); } catch (e) {}

  /* ---- 启动 ---- */
  renderCover();
  if (L.Q.get('reset') === '1') setTimeout(() => toast('已清档重来'), 400);
  if (L.Q.get('muted') === '1') { st.muted = true; saveSt(); applyVolumes(); renderSnd(); }
  if (L.Q.get('auto') === '1') {
    setTimeout(() => { S.auto = true; start(); }, 700);
  }

  /* ---- 测试钩子 ---- */
  window.__mf = {
    version: '1.0',
    get state() { return S; },
    get cfg() { return cfg; },
    get st() { return st; },
    get busy() { return S.phase !== 'play' || S.busy; },
    flip, start, claim, share, toast,
    setMuted(b) { st.muted = !!b; saveSt(); applyVolumes(); renderSnd(); },
    setAuto(on) { S.auto = !!on; if (on && S.phase === 'cover') start(); },
  };

  return { start, flip };
})();
