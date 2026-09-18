/* ui.js — 全部 DOM 屏与 HUD：标题/机库/关卡/战斗/结算/复活/排行/僚机 */
window.TF = window.TF || {};
TF.UI = (function () {
  'use strict';
  const L = () => TF.LOGIC;
  const noop = function () {};
  var NOOP = new Proxy({}, { get: function () { return noop; } });
  const SFX = () => TF.SFX || NOOP;
  const GAME = () => TF.GAME || NOOP;
  const $ = id => document.getElementById(id);
  const fmt = n => (n || 0).toLocaleString('en-US');

  let cur = 'title';
  let hi = 0;           // 机库当前查看的战机
  let wingSlot = 'wingL';
  let lastHud = 0, waveKey = '', pips = [];

  function ic(name) {
    let uri = null;
    try { uri = TF.ART && TF.ART.icon ? TF.ART.icon(name) : null; } catch (e) {}
    return uri ? `<img src="${uri}" alt="">` : '';
  }
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.style.display = 'block';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.style.display = 'none', 2200);
  }

  // ===== 屏幕切换 =====
  function show(name) {
    cur = name;
    ['title', 'hangar', 'levels', 'game'].forEach(s => $('scr-' + s).classList.toggle('on', s === name));
    if (name === 'hangar') { renderHangar(); SFX().startBGM('hangar'); }
    if (name === 'levels') renderLevels();
    if (name === 'title') { renderTitle(); SFX().startBGM('hangar'); }
  }

  // ===== 标题 =====
  function renderTitle() {
    const p = L().PROFILE.get();
    $('title-best').innerHTML = p.best.score > 0
      ? `最佳战绩 <b>${fmt(p.best.score)}</b> · 抵达第 <b>${p.best.lv}</b> 关<br>出击 ${p.stats.runs} 次 · 累计击坠 ${fmt(p.stats.kills)}`
      : '联邦空军待命 · 点击「开始出击」进入第 1 关';
    try { const em = TF.ART && TF.ART.emblem && TF.ART.emblem(); if (em) $('title-emblem').src = em; } catch (e) {}
  }

  // ===== 机库 =====
  function renderHangar() {
    const p = L().PROFILE.get();
    $('hg-coins').textContent = fmt(p.coins);
    $('hg-parts').textContent = fmt(p.parts);
    const ships = L().SHIPS, s = ships[hi], own = p.ships[s.id].own;
    const st = L().shipStat(s.id, p.ships[s.id].star);
    try { const u = TF.ART && TF.ART.ship ? TF.ART.ship(s.id) : null; if (u) $('hg-ship-img').src = u; } catch (e) {}
    $('hg-name').textContent = st.name;
    $('hg-tag').textContent = st.tag;
    $('hg-desc').textContent = st.desc || '';
    $('hg-desc').style.opacity = own ? 1 : 0.55;
    let stars = '';
    for (let i = 0; i < 5; i++) stars += `<i class="${i < p.ships[s.id].star ? 'on' : ''}"></i>`;
    $('hg-stars').innerHTML = stars;
    const bar = (id, v, max) => { $(id).style.width = clampPct(v / max * 100) + '%'; };
    bar('st-hp', st.hp, 300); bar('st-fire', st.dmg, 45);
    bar('st-rate', 300 - st.rate, 210); bar('st-spd', st.speed, 1.25);
    $('stv-hp').textContent = st.hp;
    $('stv-fire').textContent = st.dmg;
    $('stv-rate').textContent = (1000 / st.rate).toFixed(1) + '/s';
    $('stv-spd').textContent = '×' + st.speed.toFixed(2);
    const buy = $('hg-buy'), up = $('hg-up'), eq = $('hg-equip');
    if (!own) {
      buy.textContent = `购入 ⛁${fmt(s.cost)}`; buy.disabled = p.coins < s.cost;
      up.textContent = '升星'; up.disabled = true;
      eq.textContent = '未拥有'; eq.disabled = true;
    } else {
      buy.textContent = '已拥有'; buy.disabled = true;
      if (p.ships[s.id].star < 5) {
        const c = L().starCost(s.id, p.ships[s.id].star + 1);
        up.textContent = `升星 ⛁${fmt(c.coins)}+◆${c.parts}`;
        up.disabled = p.coins < c.coins || p.parts < c.parts;
      } else { up.textContent = '满星'; up.disabled = true; }
      const equipped = p.loadout.ship === s.id;
      eq.textContent = equipped ? '✓ 出战中' : '设为出战'; eq.disabled = equipped;
    }
    renderWingSlots();
  }
  const clampPct = v => Math.max(4, Math.min(100, v));
  function renderWingSlots() {
    const p = L().PROFILE.get();
    [['wg-slotL', 'wingL'], ['wg-slotR', 'wingR']].forEach(([id, slot]) => {
      const wid = p.loadout[slot];
      const el = $(id);
      if (!wid) { el.innerHTML = `<span class="wg-n" style="color:var(--faint)">空挂架 +</span>`; return; }
      const w = L().WINGS.find(x => x.id === wid);
      const lv = p.wing[wid].lv;
      let uri = null; try { uri = TF.ART && TF.ART.wing ? TF.ART.wing(wid) : null; } catch (e) {}
      el.innerHTML = `${uri ? `<img src="${uri}" alt="">` : ''}<span><span class="wg-n">${w.name} Lv${lv}</span><br><span class="wg-l">${w.desc}</span></span>`;
    });
  }
  function buyShip() {
    const p = L().PROFILE.get(), s = L().SHIPS[hi];
    if (p.ships[s.id].own || p.coins < s.cost) return;
    p.coins -= s.cost; p.ships[s.id].own = 1;
    L().PROFILE.save(); SFX().play('pu');
    toast(`已购入 ${s.name}，已设为出战`);
    p.loadout.ship = s.id; L().PROFILE.save();
    renderHangar();
  }
  function upShip() {
    const p = L().PROFILE.get(), s = L().SHIPS[hi], cur = p.ships[s.id];
    if (!cur.own || cur.star >= 5) return;
    const c = L().starCost(s.id, cur.star + 1);
    if (p.coins < c.coins || p.parts < c.parts) return;
    p.coins -= c.coins; p.parts -= c.parts; cur.star++;
    L().PROFILE.save(); SFX().play('life');
    toast(`${s.name} 升至 ${cur.star} 星`);
    renderHangar();
  }
  function equipShip() {
    const p = L().PROFILE.get(), s = L().SHIPS[hi];
    if (!p.ships[s.id].own) return;
    p.loadout.ship = s.id; L().PROFILE.save(); SFX().play('ui');
    renderHangar();
  }
  // 僚机挂架
  function openWing(slot) {
    wingSlot = slot;
    $('wing-tt').textContent = `僚机挂架 · ${slot === 'wingL' ? '左' : '右'}`;
    renderWingList(); $('dlg-wing').classList.add('on');
  }
  function renderWingList() {
    const p = L().PROFILE.get();
    const box = $('wing-list');
    box.innerHTML = '';
    L().WINGS.forEach(w => {
      const own = p.wing[w.id].own, lv = p.wing[w.id].lv;
      let uri = null; try { uri = TF.ART && TF.ART.wing ? TF.ART.wing(w.id) : null; } catch (e) {}
      const item = document.createElement('div'); item.className = 'wing-item';
      const equippedHere = p.loadout[wingSlot] === w.id, equippedOther = p.loadout[wingSlot === 'wingL' ? 'wingR' : 'wingL'] === w.id;
      let btn = '';
      if (!own) {
        btn = `<button class="btn" data-act="buy" data-id="${w.id}" ${p.coins < w.cost ? 'disabled' : ''}>购入 ⛁${fmt(w.cost)}</button>`;
      } else if (equippedHere) {
        btn = `<button class="btn" data-act="remove" data-id="${w.id}">卸下</button>`;
      } else {
        btn = `<button class="btn btn-pri" data-act="equip" data-id="${w.id}" ${equippedOther ? 'disabled' : ''}>装备</button>`;
        if (lv < 5) {
          const c = L().wingCost(w.id, lv + 1);
          btn += `<button class="btn" data-act="up" data-id="${w.id}" ${p.coins < c.coins || p.parts < c.parts ? 'disabled' : ''}>升级 ⛁${fmt(c.coins)}+◆${c.parts}</button>`;
        }
      }
      item.innerHTML = `${uri ? `<img src="${uri}">` : ''}<div class="wi-b"><div class="wi-n">${w.name}${own ? ` <span class="mono" style="color:var(--dim)">Lv${lv}</span>` : ''}</div><div class="wi-d">${w.desc}</div></div><div style="display:flex;flex-direction:column;gap:6px">${btn}</div>`;
      box.appendChild(item);
    });
    box.querySelectorAll('button[data-act]').forEach(b => b.addEventListener('click', () => {
      const p2 = L().PROFILE.get();
      const act = b.dataset.act, id = b.dataset.id, w = L().WINGS.find(x => x.id === id);
      if (act === 'buy') { if (p2.coins < w.cost) return; p2.coins -= w.cost; p2.wing[id].own = 1; p2.loadout[wingSlot] = id; toast(`已购入 ${w.name} 并装上${wingSlot === 'wingL' ? '左' : '右'}挂架`); }
      else if (act === 'equip') { p2.loadout[wingSlot] = id; }
      else if (act === 'remove') { p2.loadout[wingSlot] = null; }
      else if (act === 'up') {
        const lv = p2.wing[id].lv, c = L().wingCost(id, lv + 1);
        if (p2.coins < c.coins || p2.parts < c.parts) return;
        p2.coins -= c.coins; p2.parts -= c.parts; p2.wing[id].lv++;
        toast(`${w.name} 升至 Lv${p2.wing[id].lv}`);
      }
      L().PROFILE.save(); SFX().play('ui');
      renderWingList(); renderWingSlots(); renderHangar();
    }));
  }

  // ===== 关卡 =====
  function renderLevels() {
    const p = L().PROFILE.get();
    $('lv-coins').textContent = fmt(p.coins);
    const next = p.progress.maxLv;
    const lp = L().levelParams(next);
    $('lv-next-no').textContent = `第 ${next} 关`;
    const kinds = [...new Set(lp.waves.map(w => w.kind))];
    $('lv-next-sub').textContent = `敌舰 ${kinds.length} 型 · ${lp.waves.length} 波次 · 关底 Boss「${lp.boss.name}」`;
    $('lv-next').onclick = () => startRun(next);
    const grid = $('lv-grid');
    grid.innerHTML = '';
    const showN = Math.min(next - 1, 24);
    for (let n = Math.max(1, next - showN); n < next; n++) {
      const st = p.progress.stars['l' + n] || 0;
      const chip = document.createElement('button');
      chip.className = 'lv-chip done';
      chip.innerHTML = `<b>${n}</b><span class="lv-stars">${[0, 1, 2].map(i => `<i class="${i < st ? 'on' : ''}"></i>`).join('')}</span>`;
      chip.addEventListener('click', () => startRun(n));
      grid.appendChild(chip);
    }
    const cur = document.createElement('button');
    cur.className = 'lv-chip cur';
    cur.innerHTML = `<b>${next}</b><span class="lv-stars">${[0, 1, 2].map(() => '<i></i>').join('')}</span>`;
    cur.addEventListener('click', () => startRun(next));
    grid.appendChild(cur);
  }

  function startRun(n) {
    SFX().unlock();
    show('game');
    GAME().start(n);
    if (TF.GAME && TF.GAME.state) TF.GAME.state.demo = !!_demo;
    $('demo-badge').classList.toggle('on', !!_demo);
  }

  // ===== HUD =====
  function hudTick(G) {
    const now = performance.now();
    if (now - lastHud < 90) return;
    lastHud = now;
    const p = G.player;
    if (!p) return;
    $('hud-score').textContent = fmt(G.score);
    const combo = $('hud-combo');
    if (G.combo >= 3) {
      const txt = `×${G.combo} 连击`;
      if (combo.textContent !== txt) {
        combo.textContent = txt;
        combo.style.animation = 'none'; void combo.offsetWidth; combo.style.animation = '';
      }
    } else combo.textContent = '';
    $('hud-lv').textContent = `第 ${G.level} 关`;
    // 波次 pip
    const key = G.level + '_' + (G.lp ? G.lp.waves.length : 0);
    if (key !== waveKey) {
      waveKey = key;
      const n = G.lp ? G.lp.waves.length : 5;
      const box = $('hud-waves'); box.innerHTML = '';
      pips = [];
      for (let i = 0; i < n; i++) { const el = document.createElement('i'); box.appendChild(el); pips.push(el); }
      const bp = document.createElement('i'); bp.className = 'boss'; box.appendChild(bp); pips.push(bp);
    }
    const prog = G.director && G.director.progress ? G.director.progress() : 1;
    const doneN = Math.round(prog * (pips.length - 1));
    pips.forEach((el, i) => {
      el.className = el.className.replace(/\s?(done|on|boss)/g, '');
      if (i === pips.length - 1) el.className = 'boss' + (G.boss || G.bossPending ? ' done' : '');
      else if (i < doneN) el.className = 'done';
    });
    // 血条
    const pct = clamp2(p.hp / p.maxHp, 0, 1);
    const fill = $('hp-fill');
    fill.style.width = (pct * 100) + '%';
    fill.className = pct < 0.28 ? 'low' : pct < 0.55 ? 'mid' : '';
    $('hp-num').textContent = Math.max(0, Math.ceil(p.hp));
    $('hud-lives').innerHTML = `生命 ×${Math.max(0, p.lives)}`;
    $('hud-power').textContent = `火力 P${p.power}${p.shield > 0 ? ' · 护盾' : ''}`;
    $('bomb-n').textContent = p.bombs;
    $('btn-bomb').classList.toggle('empty', p.bombs <= 0);
    // Boss 条
    const bb = $('bossbar');
    if (G.boss) {
      bb.classList.add('on');
      $('boss-name').textContent = G.boss.name + (G.boss.phase >= 2 ? ' · 狂暴' : '');
      $('bossbar-fill').style.width = clamp2(G.boss.hp / G.boss.maxHp * 100, 0, 100) + '%';
    } else { bb.classList.remove('on'); }
  }
  const clamp2 = (v, a, b) => v < a ? a : v > b ? b : v;

  // ===== 暂停/结算/复活/排行 =====
  function togglePause() {
    if (cur !== 'game') return;
    const d = $('dlg-pause'), G = TF.GAME.state;
    if (d.classList.contains('on')) { d.classList.remove('on'); if (G.on) TF.GAME.resume(); }
    else if (G.on && G.phase === 'play') { TF.GAME.pause(); d.classList.add('on'); }
  }
  function autoPaused() {
    const d = $('dlg-pause');
    if (TF.GAME.state.on && !d.classList.contains('on')) d.classList.add('on');
    toast('已自动暂停');
  }

  let _result = null;
  function showSettle(r) {
    _result = r;
    $('stl-tt').textContent = `第 ${r.lv} 关 · 攻略完成`;
    const stars = $('stl-stars');
    stars.innerHTML = '<i></i><i></i><i></i>';
    for (let i = 0; i < r.stars; i++) setTimeout(() => { const el = stars.children[i]; if (el) el.classList.add('on'); SFX().play('combo', { rate: 1.2 + i * 0.2 }); }, 250 + i * 380);
    $('stl-rows').innerHTML = row('得分', fmt(r.score), 'big') +
      row(`通关奖励`, `+${fmt(r.scoreBonus)}`) +
      row('最高连击', '×' + r.maxCombo) +
      row('击坠', fmt(r.kills) + ' · 擦弹 ' + r.graze) +
      row('金币', `+${fmt(r.coins)} ⛁`, 'gain') +
      row('部件', `+${r.parts} ◆`, 'gain');
    $('stl-next').textContent = `下一关（第 ${r.lv + 1} 关）`;
    $('dlg-settle').classList.add('on');
  }
  function showOver(r) {
    _result = r;
    $('ov-rows').innerHTML = row('得分', fmt(r.score), 'big') +
      row('击坠', fmt(r.kills)) +
      row('金币回收', `+${fmt(r.coins)} ⛁`, 'gain');
    const p = L().PROFILE.get();
    const can = !r.revived && p.coins >= r.reviveCost;
    $('ov-revive').textContent = can ? `满血复活（⛁${fmt(r.reviveCost)}）` : (r.revived ? '已复活过' : '金币不足，无法复活');
    $('ov-revive').disabled = !can;
    $('dlg-over').classList.add('on');
    if (TF.GAME && TF.GAME.state) TF.GAME.state.demo = false;
    $('demo-badge').classList.remove('on');
  }
  const row = (k, v, cls) => `<div class="stl-row ${cls || ''}"><span>${k}</span><b class="${cls === 'gain' ? 'gain' : ''}">${v}</b></div>`;

  function showBoard() {
    const p = L().PROFILE.get();
    const box = $('board-list');
    if (!p.board.length) box.innerHTML = '<div class="board-empty">尚无战绩 · 出击开创纪录</div>';
    else box.innerHTML = p.board.map((r, i) =>
      `<div class="board-row ${i === 0 ? 'top' : ''}"><span class="rk">#${i + 1}</span><span class="sc">${fmt(r.score)}</span><span class="lv">第${r.lv}关</span><span class="dt">${new Date(r.date).getMonth() + 1}/${new Date(r.date).getDate()}</span></div>`).join('');
    $('dlg-board').classList.add('on');
  }

  // ===== 事件绑定 =====
  function initIcons() {
    const pairs = [['btn-pause', 'pause'], ['bomb-ic', 'bomb'], ['hg-back', 'back'], ['lv-back', 'back'],
      ['hg-prev', 'prev'], ['hg-next', 'next'], ['hg-coin-ic', 'coin'], ['hg-part-ic', 'part'], ['lv-coin-ic', 'coin']];
    pairs.forEach(([id, name]) => {
      const el = $(id); if (!el) return;
      let uri = null;
      try { uri = TF.ART && TF.ART.icon ? TF.ART.icon(name) : null; } catch (e) {}
      if (uri) el.src = uri;
    });
    if (!$('btn-pause').firstChild) $('btn-pause').innerHTML = ic('pause');
  }
  function bind() {
    initIcons();
    $('btn-start').addEventListener('click', () => startRun(L().PROFILE.get().progress.maxLv));
    $('btn-hangar').addEventListener('click', () => show('hangar'));
    $('btn-levels').addEventListener('click', () => show('levels'));
    $('btn-board').addEventListener('click', showBoard);
    $('btn-settings').addEventListener('click', () => TF.CFG && TF.CFG.openPanel && TF.CFG.openPanel());
    $('bd-close').addEventListener('click', () => $('dlg-board').classList.remove('on'));
    $('wg-close').addEventListener('click', () => $('dlg-wing').classList.remove('on'));
    $('hg-back').addEventListener('click', () => show('title'));
    $('lv-back').addEventListener('click', () => show('title'));
    $('hg-prev').addEventListener('click', () => { hi = (hi + L().SHIPS.length - 1) % L().SHIPS.length; SFX().play('ui'); renderHangar(); });
    $('hg-next').addEventListener('click', () => { hi = (hi + 1) % L().SHIPS.length; SFX().play('ui'); renderHangar(); });
    $('hg-buy').addEventListener('click', buyShip);
    $('hg-up').addEventListener('click', upShip);
    $('hg-equip').addEventListener('click', equipShip);
    $('wg-slotL').addEventListener('click', () => openWing('wingL'));
    $('wg-slotR').addEventListener('click', () => openWing('wingR'));
    $('btn-pause').addEventListener('click', togglePause);
    $('btn-bomb').addEventListener('click', () => GAME().bomb());
    $('pa-resume').addEventListener('click', togglePause);
    $('pa-retry').addEventListener('click', () => { $('dlg-pause').classList.remove('on'); GAME().start(TF.GAME.state.level); });
    $('pa-cfg').addEventListener('click', () => TF.CFG && TF.CFG.openPanel && TF.CFG.openPanel());
    $('pa-home').addEventListener('click', () => { $('dlg-pause').classList.remove('on'); GAME().stop(); show('levels'); });
    $('stl-next').addEventListener('click', () => { $('dlg-settle').classList.remove('on'); startRun(_result.lv + 1); });
    $('stl-retry').addEventListener('click', () => { $('dlg-settle').classList.remove('on'); startRun(_result.lv); });
    $('stl-home').addEventListener('click', () => { $('dlg-settle').classList.remove('on'); show('levels'); });
    $('ov-revive').addEventListener('click', () => {
      if (GAME().revive()) { $('dlg-over').classList.remove('on'); toast('已重返战场 · 护航无敌 3.5s'); }
      else toast('复活失败：金币不足');
    });
    $('ov-home').addEventListener('click', () => { $('dlg-over').classList.remove('on'); show('levels'); });
    document.addEventListener('pointerdown', function unlockOnce() {
      SFX().unlock(); SFX().setVol && (function () {
        try { const c = TF.CFG ? TF.CFG.all() : {}; SFX().setVol(c.bgmVol, c.sfxVol); } catch (e) {}
      })();
      document.removeEventListener('pointerdown', unlockOnce);
    });
  }

  let _demo = false;
  function setDemo(v) { _demo = v; }

  return { show, toast, hudTick, bind, togglePause, autoPaused, showSettle, showOver, setDemo, get screen() { return cur; } };
})();
