(function (root, factory) {
  const api = factory(typeof require === 'function' ? require('./logic.js') : root.DuelLogic);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DuelAI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Logic) {
  'use strict';
  function choose(g, p) {
    const actions = Logic.legal(g, p);
    if (!actions.length) return null;
    const def = uid => Logic.definition(g, uid);
    if (g.phase === 'battle') {
      const attacks = actions.filter(a => a.type === 'attack').map(a => {
        const attacker = g.players[p].monsters.find(s => s && s.uid === a.uid);
        const atk = Math.max(0, def(a.uid).atk + (attacker.buff || 0));
        let score = -1;
        if (!a.targetUid) score = 10000 + atk;
        else {
          const target = g.players[1 - p].monsters.find(s => s && s.uid === a.targetUid), c = def(a.targetUid);
          const value = Math.max(0, (target.position === 'attack' ? c.atk : c.def) + (target.buff || 0));
          if (atk > value) score = 2000 + atk - value + (target.position === 'attack' ? 800 : 0);
          else if (atk === value && target.position === 'attack') score = 100;
        }
        return { a, score };
      }).sort((x, y) => y.score - x.score);
      return attacks[0] && attacks[0].score > 0 ? attacks[0].a : { type: 'advance', player: p };
    }
    const summons = actions.filter(a => a.type === 'summon').map(a => {
      const c = def(a.uid), tributeCost = a.tributes.reduce((n, uid) => n + def(uid).atk * 0.85, 0);
      return { a, score: c.atk + c.def * 0.18 - tributeCost + (a.position === 'attack' ? 30 : 0) };
    }).sort((x, y) => y.score - x.score);
    if (summons.length) return summons[0].a;
    const spells = actions.filter(a => a.type === 'activateSpell').sort((a, b) => {
      const priority = { damage: 8, draw: 7, destroyMonster: 6, heal: 5, equip: 4, buffAll: 4, revive: 4, weaken: 3, destroySpell: 2 };
      return (priority[def(b.uid).effect.kind] || 0) - (priority[def(a.uid).effect.kind] || 0);
    });
    if (spells.length) return spells[0];
    const traps = actions.filter(a => a.type === 'setSpell' && def(a.uid).type === 'trap');
    if (traps.length) return traps[0];
    const flips = actions.filter(a => a.type === 'flip' && def(a.uid).atk >= def(a.uid).def);
    if (flips.length) return flips[0];
    const changes = actions.filter(a => a.type === 'changePosition');
    if (changes.length) {
      const wise = changes.find(a => { const s = g.players[p].monsters.find(x => x && x.uid === a.uid), c = def(a.uid); return s.position === 'attack' ? c.def > c.atk : c.atk > c.def; });
      if (wise) return wise;
    }
    const sets = actions.filter(a => a.type === 'setSpell');
    if (sets.length && g.players[p].hand.length > 5) return sets[0];
    return { type: 'advance', player: p };
  }
  return { choose };
});
