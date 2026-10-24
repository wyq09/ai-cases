(function (root, factory) {
  const api = factory(typeof require === 'function' ? require('./cards.js') : root.DuelCards);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DuelLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (DATA) {
  'use strict';
  const CARDS = DATA.CARDS;
  let serial = 0;
  function rng(seed) {
    let n = (Number(seed) || Date.now()) >>> 0;
    return () => { n += 0x6D2B79F5; let t = n; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function shuffle(a, random) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function createGame(options) {
    options = options || {};
    const random = rng(options.seed);
    const g = { players: [], cards: {}, turn: 0, round: 1, phase: 'main', normalSummoned: false, winner: null, log: [], events: [], seed: options.seed || Date.now() };
    [options.deck0 || DATA.DECKS[0].cards, options.deck1 || DATA.DECKS[1].cards].forEach(ids => {
      const p = { lp: 8000, deck: [], hand: [], monsters: [null, null, null], spells: [null, null, null], grave: [] };
      ids.forEach(id => { if (!CARDS[id]) throw new Error('未知卡牌 ' + id); const uid = 'c' + (++serial); g.cards[uid] = { uid, id }; p.deck.push(uid); });
      shuffle(p.deck, random); g.players.push(p);
    });
    for (let n = 0; n < 5; n++) for (let p = 0; p < 2; p++) draw(g, p, false);
    note(g, '决斗开始！先攻玩家不抽卡。');
    return g;
  }
  function definition(g, uid) { return CARDS[g.cards[uid].id]; }
  function note(g, message) { g.log.unshift(message); if (g.log.length > 40) g.log.length = 40; }
  function emit(g, type, data) { g.events.push(Object.assign({ type }, data || {})); }
  function draw(g, p, announce) {
    const player = g.players[p];
    if (!player.deck.length) { player.lp = 0; finish(g, 1 - p, '卡组耗尽'); return false; }
    const uid = player.deck.pop(); player.hand.push(uid);
    if (announce !== false) { note(g, (p ? '对手' : '你') + '抽了一张卡。'); emit(g, 'draw', { player: p, uid }); }
    return true;
  }
  function finish(g, winner, reason) {
    if (g.winner !== null) return;
    g.winner = winner; note(g, (winner === 0 ? '你' : '对手') + '获胜：' + reason + '。'); emit(g, 'win', { player: winner, reason });
  }
  function hurt(g, p, amount) {
    amount = Math.max(0, Math.floor(amount)); if (!amount) return;
    g.players[p].lp = Math.max(0, g.players[p].lp - amount);
    emit(g, 'damage', { player: p, amount }); note(g, (p ? '对手' : '你') + '受到 ' + amount + ' 点伤害。');
    if (!g.players[p].lp) finish(g, 1 - p, '生命值归零');
  }
  function heal(g, p, amount) { g.players[p].lp += amount; note(g, (p ? '对手' : '你') + '恢复 ' + amount + ' LP。'); }
  function discardHand(g, p, uid) { const i = g.players[p].hand.indexOf(uid); if (i < 0) return false; g.players[p].hand.splice(i, 1); return true; }
  function toGrave(g, p, uid) { g.players[p].grave.push(uid); emit(g, 'destroy', { player: p, uid }); }
  function slotOf(g, p, uid, zone) { return g.players[p][zone].findIndex(s => s && s.uid === uid); }
  function destroyMonster(g, p, index) {
    const s = g.players[p].monsters[index]; if (!s) return;
    toGrave(g, p, s.uid); g.players[p].monsters[index] = null;
    note(g, definition(g, s.uid).name + '被破坏，送入墓地。');
  }
  function destroySpell(g, p, index) {
    const s = g.players[p].spells[index]; if (!s) return;
    toGrave(g, p, s.uid); g.players[p].spells[index] = null;
  }
  function strongest(g, p) {
    let best = -1, atk = -1;
    g.players[p].monsters.forEach((s, i) => { if (s) { const a = definition(g, s.uid).atk + (s.buff || 0); if (a > atk) { atk = a; best = i; } } });
    return best;
  }
  function effect(g, p, card) {
    const e = card.effect || {}, foe = 1 - p, me = g.players[p], enemy = g.players[foe];
    emit(g, card.type === 'trap' ? 'trap' : 'spell', { player: p, uid: card.uid, id: card.id });
    if (e.kind === 'draw') for (let i = 0; i < e.value; i++) draw(g, p);
    else if (e.kind === 'heal') heal(g, p, e.value);
    else if (e.kind === 'damage') hurt(g, foe, e.value);
    else if (e.kind === 'destroyMonster') { const i = strongest(g, foe); if (i >= 0) destroyMonster(g, foe, i); }
    else if (e.kind === 'destroySpell') { const i = enemy.spells.findIndex(Boolean); if (i >= 0) destroySpell(g, foe, i); }
    else if (e.kind === 'buffAll') me.monsters.forEach(s => { if (s) s.buff = (s.buff || 0) + e.value; });
    else if (e.kind === 'weaken') enemy.monsters.forEach(s => { if (s) s.buff = (s.buff || 0) - e.value; });
    else if (e.kind === 'equip') { const i = strongest(g, p); if (i >= 0) me.monsters[i].buff = (me.monsters[i].buff || 0) + e.value; }
    else if (e.kind === 'revive') {
      const uid = me.grave.slice().reverse().find(u => definition(g, u).type === 'monster'), slot = me.monsters.findIndex(s => !s);
      if (uid && slot >= 0) { me.grave.splice(me.grave.indexOf(uid), 1); me.monsters[slot] = { uid, position: 'attack', faceDown: false, attacked: true, buff: 0 }; emit(g, 'summon', { player: p, uid }); }
    }
  }
  function hasEffectTarget(g, p, card) {
    const e = card.effect || {};
    if (e.kind === 'destroyMonster') return g.players[1 - p].monsters.some(Boolean);
    if (e.kind === 'destroySpell') return g.players[1 - p].spells.some(Boolean);
    if (e.kind === 'equip' || e.kind === 'buffAll') return g.players[p].monsters.some(Boolean);
    if (e.kind === 'revive') return g.players[p].grave.some(u => definition(g, u).type === 'monster') && g.players[p].monsters.some(s => !s);
    return true;
  }
  function fail(error) { return { ok: false, error }; }
  function act(g, a) {
    g.events = [];
    if (!a || g.winner !== null) return fail('对局已经结束');
    const p = a.player;
    if (p !== g.turn || p < 0 || p > 1) return fail('还没轮到你');
    const me = g.players[p], foe = g.players[1 - p];
    if (a.type === 'surrender') { finish(g, 1 - p, '对手认输'); return { ok: true, events: g.events }; }
    if (a.type === 'advance') {
      if (g.phase === 'main') { g.phase = 'battle'; note(g, '进入战斗阶段。'); }
      else {
        g.turn = 1 - g.turn; g.phase = 'main'; g.normalSummoned = false;
        if (g.turn === 0) g.round++;
        g.players[g.turn].monsters.forEach(s => { if (s) { s.attacked = false; s.positionChanged = false; } });
        if (g.round <= 1 && g.turn === 0) note(g, '对手回合结束。');
        else if (!draw(g, g.turn)) return { ok: true, events: g.events };
        if (g.round > 120) { const w = g.players[0].lp === g.players[1].lp ? (g.turn ? 0 : 1) : (g.players[0].lp > g.players[1].lp ? 0 : 1); finish(g, w, '回合上限，按生命值判定'); }
      }
      emit(g, 'phase', { phase: g.phase, player: g.turn }); return { ok: true, events: g.events };
    }
    if (a.type === 'summon') {
      const card = g.cards[a.uid] && definition(g, a.uid);
      if (g.phase !== 'main' || g.normalSummoned) return fail('本回合已经通常召唤，或当前阶段不能召唤');
      if (!card || card.type !== 'monster' || !me.hand.includes(a.uid)) return fail('手卡中没有这张怪兽卡');
      if (!me.monsters.some(s => !s)) return fail('怪兽区域已满');
      const needed = card.level >= 7 ? 2 : card.level >= 5 ? 1 : 0, tributes = a.tributes || [];
      if (tributes.length !== needed || new Set(tributes).size !== needed) return fail('需要解放 ' + needed + ' 只怪兽');
      if (tributes.some(uid => slotOf(g, p, uid, 'monsters') < 0)) return fail('祭品必须是自己场上的怪兽');
      if (!discardHand(g, p, a.uid)) return fail('召唤失败');
      tributes.forEach(uid => destroyMonster(g, p, slotOf(g, p, uid, 'monsters')));
      const slot = me.monsters.findIndex(s => !s);
      me.monsters[slot] = { uid: a.uid, position: a.position === 'defense' ? 'defense' : 'attack', faceDown: !!a.faceDown, attacked: false, buff: 0 };
      g.normalSummoned = true; note(g, (p ? '对手' : '你') + (a.faceDown ? '盖放了一只怪兽。' : '召唤了 ' + card.name + '。')); emit(g, 'summon', { player: p, uid: a.uid });
      return { ok: true, events: g.events };
    }
    if (a.type === 'setSpell') {
      const card = g.cards[a.uid] && definition(g, a.uid), slot = me.spells.findIndex(s => !s);
      if (g.phase !== 'main' || !card || (card.type !== 'spell' && card.type !== 'trap') || !me.hand.includes(a.uid)) return fail('现在不能盖放这张卡');
      if (slot < 0) return fail('魔法陷阱区域已满');
      discardHand(g, p, a.uid); me.spells[slot] = { uid: a.uid, faceDown: true }; note(g, (p ? '对手' : '你') + '盖放了一张卡。'); return { ok: true, events: g.events };
    }
    if (a.type === 'activateSpell') {
      const card = g.cards[a.uid] && definition(g, a.uid);
      if (g.phase !== 'main' || !card || card.type !== 'spell' || !me.hand.includes(a.uid)) return fail('魔法卡只能在自己的主要阶段从手卡发动');
      if (!hasEffectTarget(g, p, card)) return fail('没有符合条件的效果对象');
      discardHand(g, p, a.uid); note(g, (p ? '对手' : '你') + '发动 ' + card.name + '！'); effect(g, p, Object.assign({ uid: a.uid }, card)); toGrave(g, p, a.uid);
      return { ok: true, events: g.events };
    }
    if (a.type === 'flip' || a.type === 'changePosition') {
      const i = slotOf(g, p, a.uid, 'monsters'), s = me.monsters[i];
      if (g.phase !== 'main' || !s || s.attacked || s.positionChanged) return fail('这只怪兽现在不能变更表示形式');
      if (a.type === 'flip' && !s.faceDown) return fail('这只怪兽已经表侧表示');
      s.faceDown = false; s.position = a.type === 'flip' ? 'attack' : (s.position === 'attack' ? 'defense' : 'attack'); s.positionChanged = true;
      note(g, definition(g, a.uid).name + '变为' + (s.position === 'attack' ? '攻击' : '守备') + '表示。'); return { ok: true, events: g.events };
    }
    if (a.type === 'attack') {
      const ai = slotOf(g, p, a.uid, 'monsters'), attacker = me.monsters[ai];
      if (g.phase !== 'battle' || !attacker || attacker.faceDown || attacker.position !== 'attack' || attacker.attacked) return fail('这只怪兽现在不能攻击');
      if (a.targetUid && slotOf(g, 1 - p, a.targetUid, 'monsters') < 0) return fail('攻击目标不存在');
      if (!a.targetUid && foe.monsters.some(Boolean)) return fail('对方场上有怪兽，不能直接攻击');
      attacker.attacked = true; const ac = definition(g, a.uid), atk = Math.max(0, ac.atk + (attacker.buff || 0));
      note(g, ac.name + (a.targetUid ? '发起攻击！' : '发动直接攻击！')); emit(g, 'attack', { player: p, uid: a.uid, targetUid: a.targetUid });
      for (let i = 0; i < foe.spells.length; i++) {
        const ts = foe.spells[i]; if (!ts || !ts.faceDown) continue;
        const tc = definition(g, ts.uid); if (tc.type !== 'trap') continue;
        destroySpell(g, 1 - p, i); note(g, '陷阱卡 ' + tc.name + ' 发动！');
        if (tc.effect.kind === 'negateAttack') { emit(g, 'trap', { player: 1 - p, uid: ts.uid, id: tc.id }); note(g, '攻击被无效化！'); return { ok: true, events: g.events }; }
        if (tc.effect.kind === 'destroyAttacker') { emit(g, 'trap', { player: 1 - p, uid: ts.uid, id: tc.id }); destroyMonster(g, p, ai); return { ok: true, events: g.events }; }
        if (tc.effect.kind === 'mirrorDamage') { emit(g, 'trap', { player: 1 - p, uid: ts.uid, id: tc.id }); hurt(g, p, atk); return { ok: true, events: g.events }; }
      }
      if (!a.targetUid) hurt(g, 1 - p, atk);
      else {
        const di = slotOf(g, 1 - p, a.targetUid, 'monsters'), defender = foe.monsters[di], dc = definition(g, a.targetUid), wasFaceDown = defender.faceDown;
        defender.faceDown = false; const value = Math.max(0, (defender.position === 'attack' ? dc.atk : dc.def) + (defender.buff || 0));
        if (defender.position === 'attack') {
          if (atk > value) { destroyMonster(g, 1 - p, di); hurt(g, 1 - p, atk - value); }
          else if (atk < value) { destroyMonster(g, p, ai); hurt(g, p, value - atk); }
          else { destroyMonster(g, p, ai); destroyMonster(g, 1 - p, di); }
        } else if (atk > value) {
          destroyMonster(g, 1 - p, di); if (dc.piercing || ac.piercing) hurt(g, 1 - p, atk - value);
        } else if (atk < value) hurt(g, p, value - atk);
        if (wasFaceDown) note(g, dc.name + '反转！');
      }
      return { ok: true, events: g.events };
    }
    return fail('未知操作');
  }
  function legal(g, p) {
    if (g.winner !== null || g.turn !== p) return [];
    const me = g.players[p], out = [{ type: 'advance', player: p }];
    if (g.phase === 'main') {
      me.hand.forEach(uid => {
        const c = definition(g, uid);
        if (c.type === 'monster' && !g.normalSummoned && me.monsters.some(s => !s)) {
          const need = c.level >= 7 ? 2 : c.level >= 5 ? 1 : 0, available = me.monsters.filter(Boolean);
          if (available.length >= need) {
            const combos = need === 0 ? [[]] : need === 1 ? available.map(s => [s.uid]) : available.flatMap((s, i) => available.slice(i + 1).map(t => [s.uid, t.uid]));
            combos.forEach(tributes => { out.push({ type: 'summon', player: p, uid, position: 'attack', tributes }); out.push({ type: 'summon', player: p, uid, position: 'defense', faceDown: true, tributes }); });
          }
        } else if (c.type === 'spell' && hasEffectTarget(g, p, c)) out.push({ type: 'activateSpell', player: p, uid });
        if ((c.type === 'spell' || c.type === 'trap') && me.spells.some(s => !s)) out.push({ type: 'setSpell', player: p, uid });
      });
      me.monsters.forEach(s => { if (s && !s.attacked && !s.positionChanged) out.push({ type: s.faceDown ? 'flip' : 'changePosition', player: p, uid: s.uid }); });
    } else me.monsters.forEach(s => {
      if (!s || s.faceDown || s.position !== 'attack' || s.attacked) return;
      const targets = g.players[1 - p].monsters.filter(Boolean);
      if (targets.length) targets.forEach(t => out.push({ type: 'attack', player: p, uid: s.uid, targetUid: t.uid }));
      else out.push({ type: 'attack', player: p, uid: s.uid, targetUid: null });
    });
    return out;
  }
  return { createGame, act, legal, definition, CARDS };
});
