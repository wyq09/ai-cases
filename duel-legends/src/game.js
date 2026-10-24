(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const CARDS = DuelCards.CARDS, DECKS = DuelCards.DECKS;
  const Art = window.DuelArt, Audio = window.DuelAudio, Fx = window.DuelFx;
  let profile = { deck: 0, wins: 0, losses: 0, muted: false };
  try { profile = Object.assign(profile, JSON.parse(localStorage.getItem('duel-legends.profile.v1') || '{}')); } catch (_) {}
  if (window.__q && __q.reset) { profile = { deck: 0, wins: 0, losses: 0, muted: false }; try { localStorage.removeItem('duel-legends.profile.v1'); } catch (_) {} }
  let game = null, selectedDeck = Math.max(0, Math.min(DECKS.length - 1, Number(profile.deck) || 0));
  let aiBusy = false, aiTimer = 0, resultRecorded = false, currentFilter = 'all', toastTimer;
  const typeNames = { monster: '怪兽卡', spell: '魔法卡', trap: '陷阱卡' };
  const cardBack = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 286"><defs><radialGradient id="g"><stop stop-color="#284664"/><stop offset="1" stop-color="#080f1c"/></radialGradient></defs><rect width="200" height="286" fill="url(#g)"/><rect x="9" y="9" width="182" height="268" rx="7" fill="none" stroke="#8f7c54"/><g fill="none" stroke="#bca56b" opacity=".7"><circle cx="100" cy="143" r="55"/><circle cx="100" cy="143" r="43" stroke-dasharray="3 7"/><path d="M100 78l15 50 50 15-50 15-15 50-15-50-50-15 50-15z"/></g><text x="100" y="158" text-anchor="middle" font-family="serif" font-size="48" fill="#dec58b">D</text></svg>');
  function save() { profile.deck = selectedDeck; profile.muted = !!Audio.muted; try { localStorage.setItem('duel-legends.profile.v1', JSON.stringify(profile)); } catch (_) {} }
  function toast(message) { $('toast').textContent = message; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2200); }
  function closeModals() { document.querySelectorAll('.modal').forEach(m => { if (m.id !== 'resultModal') m.hidden = true; }); }
  function showScreen(id) { closeModals(); $('resultModal').hidden = true; document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id)); window.scrollTo(0, 0); }
  function updateSound() { $('soundBtn').textContent = Audio.muted ? '♩' : '♪'; $('soundBtn').setAttribute('aria-label', Audio.muted ? '开启声音' : '静音'); }
  function toggleSound() { Audio.unlock(); Audio.toggle(); updateSound(); save(); }
  function renderDecks() {
    $('deckChoices').innerHTML = DECKS.map((d, i) => '<button class="deck-choice ' + (i === selectedDeck ? 'selected' : '') + '" data-deck="' + i + '"><span class="deck-icon">' + ['♨', '♧', '✦'][i] + '</span><b>' + d.name + '</b><small>' + d.desc + '</small></button>').join('');
    $('recordText').textContent = profile.wins + ' 胜 · ' + profile.losses + ' 负';
  }
  function cardDef(uid) { return CARDS[game.cards[uid].id]; }
  function cardHTML(uid, options) {
    options = options || {}; const c = options.card || cardDef(uid), hidden = options.faceDown;
    const cls = ['game-card', c.type, hidden ? 'face-down' : '', options.position === 'defense' ? 'defense' : '', options.attacked ? 'attacked' : ''].filter(Boolean).join(' ');
    const art = hidden ? cardBack : Art.card(c);
    const name = hidden ? '里侧卡牌' : c.name;
    return '<button class="' + cls + '" data-uid="' + uid + '" data-owner="' + options.owner + '" data-zone="' + (options.zone || '') + '" aria-label="' + name + '"><img draggable="false" src="' + art + '" alt="">' + (hidden ? '' : '<span class="mini-name">' + c.name + '</span>') + (!hidden && c.type === 'monster' ? '<span class="stats">' + (c.atk + (options.buff || 0)) + '/' + (c.def + (options.buff || 0)) + '</span><span class="position-mark">' + (options.position === 'attack' ? 'ATK' : 'DEF') + '</span>' : '') + '</button>';
  }
  function renderField(p, id) {
    const root = $(id), player = game.players[p];
    ['monsters', 'spells'].forEach(zone => {
      root.querySelector('[data-zone="' + zone + '"]').innerHTML = player[zone].map(s => '<div class="slot">' + (s ? cardHTML(s.uid, { owner: p, zone, faceDown: s.faceDown, position: s.position, attacked: s.attacked, buff: s.buff }) : '') + '</div>').join('');
    });
  }
  function render() {
    if (!game) return;
    renderField(1, 'opponentField'); renderField(0, 'playerField');
    $('hand').innerHTML = game.players[0].hand.map(uid => cardHTML(uid, { owner: 0, zone: 'hand' })).join('');
    for (let p = 0; p < 2; p++) {
      $('lp' + p).textContent = game.players[p].lp; $('lpbar' + p).style.width = Math.min(100, game.players[p].lp / 80) + '%';
      $('handCount' + p).textContent = game.players[p].hand.length; $('deckCount' + p).textContent = game.players[p].deck.length; $('graveCount' + p).textContent = game.players[p].grave.length;
    }
    $('roundLabel').textContent = 'ROUND ' + String(game.round).padStart(2, '0');
    $('turnLabel').textContent = game.turn === 0 ? '你的回合' : '对手回合';
    $('phaseLabel').textContent = game.phase === 'main' ? '主要阶段' : '战斗阶段';
    $('aiThinking').textContent = game.turn === 1 ? '思考中…' : '等待中';
    document.querySelectorAll('.phase-track span').forEach(s => s.classList.toggle('active', s.dataset.phase === game.phase));
    const disabled = game.turn !== 0 || aiBusy || game.winner !== null;
    $('phaseBtn').disabled = disabled;
    $('phaseBtn').querySelector('span').textContent = game.turn === 1 ? '对手行动中' : game.phase === 'main' ? '进入战斗阶段' : '结束回合';
    $('normalStatus').classList.toggle('used', game.normalSummoned);
    $('normalStatus').querySelector('span').textContent = game.normalSummoned ? '本回合已通常召唤' : '通常召唤可用';
    $('hintText').textContent = game.turn === 0 ? (game.phase === 'main' ? '召唤怪兽 · 发动魔法 · 盖放陷阱' : '点击攻击表示怪兽选择目标') : '对手正在行动…';
    $('log').innerHTML = game.log.map(x => '<div>' + x + '</div>').join('');
  }
  function playEvents(events) {
    (events || []).forEach(e => {
      const sound = ['draw', 'summon', 'spell', 'trap', 'attack', 'damage', 'destroy', 'phase', 'win'].includes(e.type) ? e.type : 'click';
      Audio.play(sound);
      const uidEl = e.uid ? document.querySelector('.game-card[data-uid="' + e.uid + '"]') : null;
      if (['summon', 'spell', 'trap', 'attack', 'destroy', 'win'].includes(e.type)) Fx.burst(e.type, uidEl || (e.player !== undefined ? $('lp' + e.player) : null));
      if (e.type === 'damage') { Fx.text('−' + e.amount, $('lp' + e.player)); Fx.shake(); }
    });
  }
  function perform(action) {
    if (!game) return { ok: false, error: '尚未开始' };
    const result = DuelLogic.act(game, action);
    if (!result.ok) { toast(result.error); return result; }
    closeModals(); render(); playEvents(result.events);
    if (game.winner !== null) setTimeout(showResult, 650);
    else if (game.turn === 1) scheduleAI();
    return result;
  }
  function scheduleAI() {
    if (aiBusy || game.winner !== null) return;
    aiBusy = true; render(); let steps = 0;
    const tick = () => {
      if (!game || game.winner !== null || game.turn !== 1 || steps++ > 100) { aiBusy = false; if (game) render(); return; }
      const action = DuelAI.choose(game, 1) || { type: 'advance', player: 1 };
      const result = DuelLogic.act(game, action);
      if (!result.ok) { console.error('AI illegal action', action, result.error); DuelLogic.act(game, { type: 'advance', player: 1 }); }
      render(); playEvents(result.events);
      if (game.winner !== null || game.turn === 0) { aiBusy = false; render(); if (game.winner !== null) setTimeout(showResult, 650); return; }
      aiTimer = setTimeout(tick, window.__q && __q.fast ? 30 : 430);
    };
    aiTimer = setTimeout(tick, window.__q && __q.fast ? 30 : 600);
  }
  function newGame(deckIndex, seed) {
    clearTimeout(aiTimer); aiBusy = false; resultRecorded = false; selectedDeck = typeof deckIndex === 'number' ? deckIndex : selectedDeck;
    game = DuelLogic.createGame({ deck0: DECKS[selectedDeck].cards, deck1: DECKS[(selectedDeck + 1) % DECKS.length].cards, seed: seed || (window.__q && __q.seed) || Date.now() });
    $('deckName').textContent = DECKS[selectedDeck].name; showScreen('duelScreen'); render(); save(); Audio.unlock(); Audio.play('phase');
    return game;
  }
  function showResult() {
    if (!game || game.winner === null) return;
    if (!resultRecorded) { if (game.winner === 0) profile.wins++; else profile.losses++; resultRecorded = true; save(); }
    $('resultTitle').textContent = game.winner === 0 ? '决斗胜利' : '惜败';
    $('resultReason').textContent = game.winner === 0 ? '精彩的决斗。你的战术撕开了对手的防线。' : '胜负只在一念之间，调整卡组再战一次吧。';
    $('resultRound').textContent = game.round; $('resultLp').textContent = game.players[0].lp; $('resultSigil').textContent = game.winner === 0 ? '✦' : '◇';
    $('resultModal').hidden = false; Fx.burst('win', $('resultSigil'));
  }
  function actionLabel(a) {
    const c = cardDef(a.uid);
    if (a.type === 'summon') return (a.faceDown ? '里侧守备盖放' : a.position === 'defense' ? '守备表示召唤' : '攻击表示召唤') + (a.tributes.length ? ' · 解放 ' + a.tributes.length + ' 只' : ' · ' + c.level + ' 星');
    if (a.type === 'activateSpell') return '发动魔法 · ' + c.name;
    if (a.type === 'setSpell') return '盖放到魔法陷阱区域';
    if (a.type === 'flip') return '反转召唤为攻击表示';
    if (a.type === 'changePosition') return '变更攻击 / 守备表示';
    if (a.type === 'attack') return a.targetUid ? '攻击 · ' + cardDef(a.targetUid).name : '直接攻击对手';
    return a.type;
  }
  function openCard(uid, owner, zone, collectionMode) {
    if (!collectionMode && game && owner === 1) {
      const p = game.players[1], s = p.monsters.concat(p.spells).find(x => x && x.uid === uid);
      if (s && s.faceDown) { toast('里侧表示的卡牌无法查看'); return; }
    }
    const c = collectionMode ? CARDS[uid] : cardDef(uid);
    $('detailArt').innerHTML = '<img src="' + Art.card(c) + '" alt="' + c.name + '">';
    $('detailType').textContent = typeNames[c.type] + (c.attribute ? ' / ' + c.attribute + '属性 / ' + c.race + '族' : '');
    $('detailName').textContent = c.name;
    $('detailStats').innerHTML = c.type === 'monster' ? '<span>LV ' + c.level + '</span><span>攻击力 ' + c.atk + '</span><span>守备力 ' + c.def + '</span>' : '<span>' + (c.type === 'spell' ? '通常魔法' : '反击陷阱') + '</span>';
    $('detailDesc').textContent = c.desc;
    let actions = [];
    if (!collectionMode && game && game.turn === 0 && !aiBusy && game.winner === null) actions = DuelLogic.legal(game, 0).filter(a => a.uid === uid);
    $('detailActions').innerHTML = actions.length ? actions.map((a, i) => '<button class="action-choice" data-action="' + i + '"><span>' + actionLabel(a) + '</span><b>→</b></button>').join('') : '<small style="color:#737f91">当前阶段无可用操作 · 可查看卡牌详情</small>';
    $('detailActions').querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => perform(actions[Number(btn.dataset.action)])));
    $('cardModal').hidden = false; Audio.play('click');
  }
  function renderCollection() {
    const query = $('cardSearch').value.trim().toLowerCase();
    const cards = Object.values(CARDS).filter(c => (currentFilter === 'all' || c.type === currentFilter) && (!query || (c.name + c.desc + (c.race || '')).toLowerCase().includes(query)));
    $('collectionTotal').textContent = cards.length + ' / ' + Object.keys(CARDS).length + ' 张';
    $('collectionGrid').innerHTML = cards.map(c => '<button class="archive-card" data-card="' + c.id + '"><span class="archive-type">' + typeNames[c.type] + '</span><img loading="lazy" src="' + Art.card(c) + '" alt="' + c.name + '"><h3>' + c.name + '</h3><p>' + (c.type === 'monster' ? 'LV ' + c.level + ' · ' + c.atk + ' / ' + c.def : c.attribute || (c.type === 'spell' ? '战术魔法' : '自动触发')) + '</p></button>').join('') || '<p>没有找到符合条件的卡牌。</p>';
  }
  document.addEventListener('click', e => {
    const close = e.target.closest('[data-close]'); if (close) { close.closest('.modal').hidden = true; return; }
    const deck = e.target.closest('[data-deck]'); if (deck) { selectedDeck = Number(deck.dataset.deck); renderDecks(); save(); Audio.unlock(); Audio.play('click'); return; }
    const archive = e.target.closest('[data-card]'); if (archive) { openCard(archive.dataset.card, 0, '', true); return; }
    const card = e.target.closest('.game-card[data-uid]'); if (card && !aiBusy) { openCard(card.dataset.uid, Number(card.dataset.owner), card.dataset.zone, false); }
  });
  $('startBtn').addEventListener('click', () => newGame());
  $('phaseBtn').addEventListener('click', () => perform({ type: 'advance', player: 0 }));
  $('soundBtn').addEventListener('click', toggleSound); $('menuSound').addEventListener('click', toggleSound);
  $('rulesBtn').addEventListener('click', () => { $('rulesModal').hidden = false; });
  $('menuBtn').addEventListener('click', () => { $('menuModal').hidden = false; }); $('exitBtn').addEventListener('click', () => { $('menuModal').hidden = false; });
  $('menuRules').addEventListener('click', () => { $('menuModal').hidden = true; $('rulesModal').hidden = false; });
  $('logBtn').addEventListener('click', () => { $('logModal').hidden = false; });
  $('inspectFieldBtn').addEventListener('click', () => { toast('点击任意场上卡牌可查看效果、攻守与可用操作'); });
  $('collectionBtn').addEventListener('click', () => { showScreen('collectionScreen'); renderCollection(); });
  $('collectionBack').addEventListener('click', () => showScreen('homeScreen'));
  $('cardFilters').addEventListener('click', e => { if (!e.target.dataset.filter) return; currentFilter = e.target.dataset.filter; $('cardFilters').querySelectorAll('button').forEach(b => b.classList.toggle('active', b === e.target)); renderCollection(); });
  $('cardSearch').addEventListener('input', renderCollection);
  $('restartBtn').addEventListener('click', () => newGame());
  $('rematchBtn').addEventListener('click', () => newGame());
  $('resultHome').addEventListener('click', () => { renderDecks(); showScreen('homeScreen'); });
  $('surrenderBtn').addEventListener('click', () => { if (game && game.winner === null && game.turn === 0) perform({ type: 'surrender', player: 0 }); else if (game && game.winner === null) { clearTimeout(aiTimer); aiBusy = false; profile.losses++; save(); } showScreen('homeScreen'); renderDecks(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModals(); });
  document.addEventListener('pointerdown', () => Audio.unlock(), { once: true });
  if (profile.muted !== Audio.muted) Audio.toggle(); updateSound(); renderDecks();
  $('avatar0').src = Art.avatar(0); $('avatar1').src = Art.avatar(1);
  $('heroMonster').src = Art.card(CARDS.sunforge_dragon); $('heroSpell').src = Art.card(CARDS.black_seal_bolt);
  window.__duel = { state: () => game ? JSON.parse(JSON.stringify(game)) : null, act: perform, newGame, legal: () => game ? DuelLogic.legal(game, game.turn) : [], cards: CARDS, decks: DECKS };
})();
