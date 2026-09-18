/* game.js — 引擎：循环/输入/碰撞/子弹/道具/僚机/Boss编排/打击感/渲染/AI演示 */
window.TF = window.TF || {};
TF.GAME = (function () {
  'use strict';
  const L = () => TF.LOGIC;
  const noop = function () {};
  var NOOP = new Proxy({}, { get: function () { return noop; } });
  const FX = () => TF.FX || NOOP;
  const SFX = () => TF.SFX || NOOP;
  const CFG = () => (TF.CFG ? TF.CFG.all() : { sens:1.15, fireK:1, diff:1, dropK:1, shake:1, vib:1, quality:'auto', demoSpd:1 });
  const EN = () => TF.ENEMY || null;

  const W = 420; let H = 760;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const rnd = Math.random;

  // ===== 全局状态 =====
  const G = {
    on: false, paused: false, level: 1, lp: null, t: 0,
    score: 0, combo: 0, comboT: 0, maxCombo: 0, kills: 0, grazeN: 0,
    coins: 0, parts: 0, deaths: 0, revived: false,
    phase: 'play', player: null, bullets: [], ebullets: [], enemies: [], powers: [], beams: [], zaps: [],
    boss: null, bossWarnT: 0, bossPending: false,
    director: null, freeze: 0, timeScale: 1, tsTarget: 1,
    god: false, demo: false, demoBombT: 0, ended: false,
  };

  // ===== 资源缓存 =====
  const _img = {}, _white = {};
  function img(key, uri) {
    if (!uri) return null;
    let e = _img[key];
    if (!e) { e = _img[key] = new Image(); e.src = uri; }
    return e.complete && e.naturalWidth ? e : null;
  }
  function whiteImg(key, image) {
    if (!image) return null;
    let e = _white[key];
    if (!e) {
      const c = document.createElement('canvas');
      c.width = image.naturalWidth; c.height = image.naturalHeight;
      const x = c.getContext('2d');
      x.drawImage(image, 0, 0);
      x.globalCompositeOperation = 'source-in';
      x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
      e = _white[key] = c;
    }
    return e;
  }
  function drawSprite(ctx, key, uri, x, y, w, h, rot, flash) {
    const im = img(key, uri);
    ctx.save(); ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    if (im) {
      ctx.drawImage(im, -w / 2, -h / 2, w, h);
      if (flash > 0) { const wh = whiteImg(key, im); if (wh) { ctx.globalAlpha = Math.min(1, flash * 8); ctx.drawImage(wh, -w / 2, -h / 2, w, h); } }
    } else { // 占位
      ctx.fillStyle = flash > 0 ? '#fff' : '#46586c';
      ctx.beginPath(); ctx.moveTo(0, -h / 2); ctx.lineTo(w / 2, h / 2); ctx.lineTo(-w / 2, h / 2); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // ===== 预渲染子弹贴图 =====
  function bulletSprite(r, core, rim, elong) {
    const c = document.createElement('canvas'); const pad = r * 2.6;
    c.width = c.height = Math.ceil(pad * 2);
    const x = c.getContext('2d');
    let g = x.createRadialGradient(pad, pad, 0, pad, pad, r * 2.3);
    g.addColorStop(0, rim); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, pad * 2, pad * 2);
    x.globalCompositeOperation = 'lighter';
    x.fillStyle = core; x.strokeStyle = rim; x.lineWidth = Math.max(1, r * 0.26);
    x.beginPath();
    if (elong) { x.ellipse(pad, pad, r * 0.5, r * 1.25, 0, 0, TAU); x.fill(); x.stroke(); }
    else { x.arc(pad, pad, r * 0.78, 0, TAU); x.fill(); x.beginPath(); x.arc(pad, pad, r * 0.95, 0, TAU); x.stroke(); }
    return c;
  }
  const SPR = {};
  function initSprites() {
    SPR.pb = bulletSprite(4, '#eafffa', 'rgba(53,224,200,.8)', true);
    SPR.pb2 = bulletSprite(4, '#fff7e0', 'rgba(255,208,80,.8)', true);
    SPR.ph = bulletSprite(7, '#fff2d0', 'rgba(255,150,60,.9)');
    SPR.pp = bulletSprite(5.5, '#e8ffff', 'rgba(80,220,255,.9)', true);
    SPR.pp2 = bulletSprite(5.5, '#e8d8ff', 'rgba(190,120,255,.9)', true);
    SPR.eb = bulletSprite(5, '#fff0e8', 'rgba(255,90,60,.95)');
    SPR.eb2 = bulletSprite(5, '#ffe8ff', 'rgba(200,80,255,.9)');
    SPR.eb3 = bulletSprite(6, '#fffbe0', 'rgba(255,176,32,.95)');
  }

  // ===== 背景星野 =====
  let bgLayers = [];
  function buildBg() {
    bgLayers = [];
    [[0.5, 1.4, 110], [1, 1, 70], [1.8, 0.7, 40]].forEach(([sc, alpha, n]) => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 256;
      const x = c.getContext('2d');
      for (let i = 0; i < n; i++) {
        const a = alpha * (0.25 + rnd() * 0.75);
        x.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
        const s = sc * (0.6 + rnd() * 0.9);
        x.fillRect(rnd() * 256, rnd() * 256, s, s);
      }
      bgLayers.push({ c, y: 0, spd: 22 * sc });
    });
    const nc = document.createElement('canvas'); nc.width = 420; nc.height = 900;
    const nx = nc.getContext('2d');
    [[110, 200, 190, 'rgba(38,80,96,.20)'], [330, 620, 230, 'rgba(70,42,96,.16)'], [210, 430, 300, 'rgba(20,60,70,.12)']]
      .forEach(([x0, y0, r, col]) => {
        const g = nx.createRadialGradient(x0, y0, 0, x0, y0, r);
        g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
        nx.fillStyle = g; nx.fillRect(0, 0, 420, 900);
      });
    bgLayers.push({ c: nc, y: 0, spd: 9, big: true });
  }

  // ===== 对象池 =====
  const pools = { pb: [], eb: [], en: [], pw: [] };
  const take = k => pools[k].pop() || {};
  const back = (k, o) => { if (pools[k].length < 220) pools[k].push(o); };

  // ===== 视图 =====
  const cv = () => document.getElementById('cv');
  const ctx = () => cv().getContext('2d');
  let view = { fit: 1, dpr: 1 };
  function resize() {
    const iw = innerWidth, ih = innerHeight;
    H = clamp(Math.round(W * ih / iw), 560, 900);
    const fit = Math.min(iw / W, ih / H);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    view = { fit, dpr };
    const c = cv();
    c.width = Math.round(W * fit * dpr); c.height = Math.round(H * fit * dpr);
    c.style.width = W * fit + 'px'; c.style.height = H * fit + 'px';
  }

  // ===== 输入 =====
  const input = { dragging: false, lx: 0, ly: 0, keys: {} };
  function bindInput() {
    const el = document.getElementById('scr-game');
    el.addEventListener('pointerdown', e => {
      if (e.target.closest('#btn-bomb,#btn-pause,.dlg')) return;
      input.dragging = true; input.lx = e.clientX; input.ly = e.clientY;
    });
    addEventListener('pointermove', e => {
      if (!input.dragging || !G.player || G.player.dead) return;
      const p = G.player;
      const dx = (e.clientX - input.lx) / view.fit * CFG().sens;
      const dy = (e.clientY - input.ly) / view.fit * CFG().sens;
      p.tx = clamp(p.tx + dx, 22, W - 22); p.ty = clamp(p.ty + dy, H * 0.10, H - 60);
      input.lx = e.clientX; input.ly = e.clientY;
    }, { passive: true });
    addEventListener('pointerup', () => input.dragging = false);
    addEventListener('pointercancel', () => input.dragging = false);
    addEventListener('keydown', e => {
      input.keys[e.key] = true;
      if (e.key === ' ') { bomb(); e.preventDefault(); }
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') TF.UI && TF.UI.togglePause && TF.UI.togglePause();
    });
    addEventListener('keyup', e => input.keys[e.key] = false);
    addEventListener('resize', resize);
  }
  function keyboardMove(p, dt) {
    const k = input.keys, sp = 340 * p.spd;
    let dx = 0, dy = 0;
    if (k.ArrowLeft || k.a || k.A) dx -= 1;
    if (k.ArrowRight || k.d || k.D) dx += 1;
    if (k.ArrowUp || k.w || k.W) dy -= 1;
    if (k.ArrowDown || k.s || k.S) dy += 1;
    if (dx || dy) { p.tx = clamp(p.tx + dx * sp * dt, 22, W - 22); p.ty = clamp(p.ty + dy * sp * dt, H * 0.10, H - 60); }
  }

  // ===== 打击感 =====
  function hitStop(sec) { G.freeze = Math.max(G.freeze, sec); }
  function shake(p) { if (CFG().shake) FX().addShake(p); }
  function vib(p) { try { if (CFG().vib && navigator.vibrate) navigator.vibrate(p); } catch (e) {} }

  // ===== 开局 =====
  function makePlayer() {
    const pf = L().PROFILE.get();
    const lo = pf.loadout, star = pf.ships[lo.ship].star;
    const st = L().shipStat(lo.ship, star);
    return {
      x: W / 2, y: H - 130, tx: W / 2, ty: H - 130, vx: 0,
      hp: st.hp, maxHp: st.hp, lives: 2, bombs: 2, power: 1,
      ship: st, spd: st.speed, fireT: 0, inv: 2.2, shield: 0,
      dead: false, respawnT: 0, tilt: 0, wl: wingOf('wingL'), wr: wingOf('wingR'),
      wt1: 0, wt2: 0, zapT: 0,
    };
  }
  function wingOf(slot) {
    const pf = L().PROFILE.get();
    const id = slot === 'wingL' ? pf.loadout.wingL : pf.loadout.wingR;
    if (!id || !pf.wing[id].own) return null;
    return { id, stat: L().wingStat(id, pf.wing[id].lv), lv: pf.wing[id].lv, x: 0, y: 0 };
  }

  function start(levelNo, opts) {
    opts = opts || {};
    const lp = L().levelParams(levelNo);
    G.level = levelNo; G.lp = lp; G.t = 0;
    G.score = 0; G.combo = 0; G.comboT = 0; G.maxCombo = 0; G.kills = 0; G.grazeN = 0;
    G.coins = 0; G.parts = 0; G.deaths = 0; G.revived = !!opts.revived;
    G.bullets.length = 0; G.ebullets.length = 0; G.enemies.length = 0;
    G.powers.length = 0; G.beams.length = 0; G.zaps.length = 0;
    G.boss = null; G.bossPending = false; G.bossWarnT = 0;
    G.freeze = 0; G.timeScale = 1; G.tsTarget = 1; G.ended = false;
    G.phase = 'play';
    G.player = makePlayer();
    const dir = EN() && EN().DIRECTOR;
    G.director = dir ? dir.build(lp.waves) : null;
    G.on = true; G.paused = false;
    if (!SPR.pb) initSprites();
    if (!bgLayers.length) buildBg();
    SFX().startBGM('battle');
  }

  // ===== 玩家行为 =====
  function firePlayer(p, dt) {
    p.fireT -= dt;
    if (p.fireT > 0) return;
    const st = p.ship;
    p.fireT = Math.max(0.05, st.rate / 1000 / Math.max(0.5, CFG().fireK));
    const pat = L().firePattern(st.id, p.power);
    let kindN = 1;
    for (const b of pat) if (b.kind === 'heavy' || b.kind === 'pierce' || b.kind === 'plasma') kindN = 3;
    for (const s of pat) {
      const b = take('pb');
      const ang = -Math.PI / 2 + s.ang + (rnd() - 0.5) * 0.024;
      const heavy = s.kind === 'heavy', pierce = s.kind === 'pierce', plasma = s.kind === 'plasma';
      b.x = p.x + s.dx; b.y = p.y - 26;
      b.vx = Math.cos(ang) * (heavy ? 540 : pierce ? 800 : 660);
      b.vy = Math.sin(ang) * (heavy ? 540 : pierce ? 800 : 660);
      b.dmg = st.dmg * s.dmgK; b.kind = s.kind;
      b.r = heavy ? 7 : plasma ? 5.5 : 4;
      b.hits = 0; b.maxHits = pierce ? 3 : 1; b.t = 0;
      G.bullets.push(b);
    }
    FX().muzzle(p.x, p.y - 26, -Math.PI / 2, kindN === 3 ? 1.3 : 1);
    p.y += 1.2; // 后座
    SFX().play(kindN === 3 ? 'shoot3' : st.id === 'E' || st.id === 'F' ? 'shoot2' : 'shoot1', { vol: 0.5, rate: 0.96 + rnd() * 0.08 });
  }
  function fireWings(p, dt) {
    ['wl', 'wr'].forEach((k, i) => {
      const wg = p[k]; if (!wg) return;
      const side = i === 0 ? -1 : 1;
      wg.x += (p.x + side * 36 - wg.x) * Math.min(1, dt * 10);
      wg.y += (p.y + 6 - wg.y) * Math.min(1, dt * 10);
      wg.t = (wg.t || 0) + dt;
      if (wg.id === 'gun' && wg.t >= wg.stat.rate / 1000) {
        wg.t = 0;
        for (const off of [-3, 3]) {
          const b = take('pb');
          b.x = wg.x + off; b.y = wg.y - 8; b.vx = 0; b.vy = -700;
          b.dmg = wg.stat.dmg * 0.5; b.kind = 'bullet'; b.r = 3; b.hits = 0; b.maxHits = 1; b.t = 0;
          G.bullets.push(b);
        }
        SFX().play('shoot1', { vol: 0.14, rate: 1.25 });
      } else if (wg.id === 'missile' && wg.t >= wg.stat.rate) {
        wg.t = 0;
        const b = take('pb');
        b.x = wg.x; b.y = wg.y; b.vx = side * 60; b.vy = -300;
        b.dmg = wg.stat.dmg; b.kind = 'missile'; b.r = 5; b.hits = 0; b.maxHits = 1;
        b.homing = 3.2; b.t = 0; b.life = 3.2;
        G.bullets.push(b);
        SFX().play('shoot2', { vol: 0.3, rate: 0.7 });
      } else if (wg.id === 'tesla' && wg.t >= wg.stat.rate) {
        wg.t = 0; teslaZap(wg);
      }
    });
  }
  function teslaZap(wg) {
    const targets = nearestEnemies(wg.x, wg.y, 300, 2 + Math.floor(wg.lv / 2));
    if (!targets.length) return;
    let px = wg.x, py = wg.y, pts = [[px, py]];
    for (const e of targets) {
      pts.push([e.x, e.y]);
      if (e === G.boss) damageBoss(wg.stat.dmg);
      else damageEnemy(e, wg.stat.dmg, false);
      FX().burst(e.x, e.y, { kind: 'star', n: 5, color: '#7df0ff', spd: 90, size: 5, life: 0.3 });
      px = e.x; py = e.y;
    }
    G.zaps.push({ pts, t: 0.16, max: 0.16 });
    SFX().play('shoot2', { vol: 0.42, rate: 1.5 });
  }
  function nearestEnemies(x, y, r, n) {
    const out = [];
    for (const e of G.enemies) { const d = Math.hypot(e.x - x, e.y - y); if (d < r) out.push([d, e]); }
    if (G.boss && !G.boss.dying) { const d = Math.hypot(G.boss.x - x, G.boss.y - y); if (d < r + 60) out.push([d, G.boss]); }
    out.sort((a, b) => a[0] - b[0]);
    return out.slice(0, n).map(v => v[1]);
  }

  function playerHit(dmg) {
    const p = G.player;
    if (p.dead || p.inv > 0 || G.god) return;
    if (p.shield > 0) { p.shield = 0; FX().ring(p.x, p.y, { r0: 20, r1: 60, life: 0.3, color: '#7df0ff', width: 3 }); SFX().play('shieldbrk'); return; }
    p.hp -= dmg;
    p.inv = 0.9;
    FX().flash('#ff2418', 0.32, 220); shake(0.6); hitStop(0.05); vib(60);
    FX().burst(p.x, p.y, { kind: 'spark', n: 10, color: '#ff8a60', spd: 200, size: 4, life: 0.35 });
    SFX().play('phurt');
    if (p.hp <= 0) crash();
  }
  function crash() {
    const p = G.player;
    p.dead = true; p.respawnT = 1.3; G.deaths++;
    G.combo = 0;
    FX().explosion(p.x, p.y, 2.4); FX().flash('#ffd0a0', 0.5, 400);
    shake(1.2); vib([40, 60, 90]);
    hitStop(0.1);
    G.tsTarget = 0.35; setTimeout(() => G.tsTarget = 1, 900);
    SFX().play('pdie');
    p.lives--;
    if (p.lives < 0) { gameOver(); }
  }
  function respawn() {
    const p = G.player;
    p.dead = false; p.hp = p.maxHp; p.x = p.tx = W / 2; p.y = p.ty = H - 130;
    p.inv = 3; p.power = Math.max(0, p.power - 1);
    G.ebullets.length = 0; // 清屏给喘息
  }
  function gameOver() {
    if (G.ended) return;
    G.phase = 'over';
    settleRun(false);
    TF.UI && TF.UI.showOver && TF.UI.showOver(settleData(false));
  }
  function bomb() {
    const p = G.player;
    if (!G.on || G.paused || !p || p.dead || p.bombs <= 0 || G.phase !== 'play') return;
    p.bombs--;
    p.inv = Math.max(p.inv, 1.6);
    FX().flash('#fff5e0', 0.85, 600);
    FX().ring(p.x, p.y, { r0: 20, r1: Math.max(W, H), life: 0.7, color: '#ffe9c0', width: 14 });
    FX().ring(p.x, p.y, { r0: 10, r1: Math.max(W, H) * 0.7, life: 0.5, color: '#35e0c8', width: 6 });
    shake(1.0); vib([30, 40, 80]); hitStop(0.06);
    SFX().play('bomb');
    for (const b of G.ebullets) { FX().burst(b.x, b.y, { kind: 'star', n: 2, color: '#ffe9c0', spd: 60, size: 3, life: 0.25 }); G.score += 10; }
    G.ebullets.length = 0;
    for (const e of G.enemies) damageEnemy(e, 140 + G.level * 10, false);
    if (G.boss && !G.boss.dying) damageBoss(150 + G.level * 8);
  }

  // ===== 敌我伤害 =====
  function damageEnemy(e, dmg, showNum) {
    e.hp -= dmg; e.flash = 0.08;
    if (e.kind !== 'tank' && e.kind !== 'elite') e.kx = (e.kx || 0) + (rnd() - 0.5) * 3;
    if (showNum) FX().floatText(e.x, e.y - e.size * 0.4, Math.round(dmg) + '', { size: 11 });
    if (e.hp <= 0 && !e.dead) killEnemy(e);
  }
  function damageBoss(dmg) {
    const b = G.boss; if (!b || b.dying) return;
    b.hp -= dmg; b.flash = 0.06;
    if (b.hp <= 0) killBoss();
  }
  function killEnemy(e) {
    e.dead = true;
    G.kills++;
    G.combo++; G.comboT = 2.2; G.maxCombo = Math.max(G.maxCombo, G.combo);
    const pts = Math.round(e.score * L().comboMult(G.combo));
    G.score += pts;
    G.coins += e.coins;
    FX().floatText(e.x, e.y - 10, '+' + pts, { color: '#ffe9c0', size: e.size > 50 ? 15 : 12 });
    const big = e.size >= 50;
    FX().explosion(e.x, e.y, big ? 1.8 : e.size >= 36 ? 1.15 : 0.8);
    shake(big ? 0.5 : 0.22);
    hitStop(big ? 0.085 : 0.04);
    vib(12);
    SFX().play(big ? 'bigdie' : e.size >= 36 ? 'die2' : 'die1', { rate: 0.94 + rnd() * 0.12 });
    if (G.combo > 0 && G.combo % 10 === 0) SFX().play('combo', { rate: 1 + Math.min(G.combo, 50) / 60 });
    // 掉落
    const r = rnd;
    if (e.kind === 'carrier') {
      const roll = r();
      spawnPower(e.x, e.y, roll < 0.4 ? 'P' : roll < 0.7 ? 'B' : roll < 0.9 ? 'H' : 'S');
    } else if (e.kind === 'elite') {
      spawnPower(e.x - 14, e.y, 'P'); spawnPower(e.x + 14, e.y, rnd() < 0.5 ? 'coin' : 'H');
    } else {
      const d = L().dropsFor(e.kind, rnd, CFG().dropK);
      if (d) spawnPower(e.x, e.y, d);
    }
  }
  function killBoss() {
    const b = G.boss;
    b.dying = true; b.dieT = 1.9;
    G.score += 3000 + 500 * G.level;
    G.tsTarget = 0.3; hitStop(0.12);
    shake(1.4); vib([50, 60, 120]);
    SFX().play('bossdie');
    SFX().stopBGM();
    G.ebullets.length = 0; G.beams.length = 0;
  }
  function bossDeathTick(dt) {
    const b = G.boss;
    b.dieT -= dt;
    if (rnd() < dt * 14) {
      const x = b.x + (rnd() - 0.5) * b.w, y = b.y + (rnd() - 0.5) * 90;
      FX().explosion(x, y, 0.7 + rnd() * 0.9);
      SFX().play('die2', { rate: 0.8 + rnd() * 0.5, vol: 0.7 });
      shake(0.3);
    }
    if (b.dieT <= 0) {
      FX().explosion(b.x, b.y, 3.2); FX().flash('#fff5e0', 0.9, 700);
      shake(1.6); hitStop(0.09);
      G.tsTarget = 1;
      // 掉落雨
      spawnPower(b.x - 30, b.y, 'part'); spawnPower(b.x + 30, b.y, 'P'); spawnPower(b.x, b.y - 20, 'H');
      for (let i = 0; i < 5; i++) spawnPower(b.x + (rnd() - 0.5) * 80, b.y + (rnd() - 0.5) * 40, 'coin');
      G.boss = null;
      G.phase = 'clear'; G.clearT = 2.0;
      SFX().play('clear');
    }
  }

  // ===== 道具 =====
  function spawnPower(x, y, kind) {
    const o = take('pw');
    o.x = clamp(x, 24, W - 24); o.y = y; o.kind = kind; o.vy = 55; o.t = rnd() * 6; o.mag = false;
    G.powers.push(o);
  }
  function applyPower(kind) {
    const p = G.player;
    SFX().play(kind === 'coin' ? 'coin' : kind === 'part' ? 'coin' : 'pu');
    if (kind === 'P') {
      if (p.power < 4) { p.power++; FX().floatText(p.x, p.y - 34, '火力提升', { color: '#ffb020', size: 14 }); }
      else { G.score += 500; FX().floatText(p.x, p.y - 34, '+500', { color: '#ffe9c0', size: 13 }); }
    } else if (kind === 'B') { if (p.bombs < 6) p.bombs++; else G.score += 300; }
    else if (kind === 'H') { p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * 0.25)); FX().floatText(p.x, p.y - 34, '装甲修复', { color: '#7df0a0', size: 13 }); }
    else if (kind === 'S') { p.shield = 8; FX().ring(p.x, p.y, { r0: 14, r1: 44, life: 0.4, color: '#7df0ff', width: 3 }); SFX().play('shield'); }
    else if (kind === 'L') { if (p.lives < 5) p.lives++; else G.score += 800; SFX().play('life'); }
    else if (kind === 'coin') G.coins += 12;
    else if (kind === 'part') G.parts += 1;
  }

  // ===== Boss 出场 =====
  function updateBossFlow(dt) {
    if (G.boss || G.phase !== 'play') return;
    const dirDone = !G.director || G.director.done();
    const clear = G.enemies.length === 0;
    if (dirDone && clear && !G.bossPending) {
      G.bossPending = true; G.bossWarnT = 2.4;
      SFX().play('bosswarn'); vib([80, 80, 80]);
    }
    if (G.bossPending) {
      G.bossWarnT -= dt;
      if (G.bossWarnT <= 0) {
        G.bossPending = false;
        const b = EN() && EN().BOSS ? EN().BOSS.build(G.lp) : null;
        if (b) {
          const dk = CFG().diff || 1;
          b.hp = b.maxHp = Math.round(b.hp * dk);
          b.flash = 0; G.boss = b; SFX().startBGM('boss');
        }
        else { // 无行为模块：直接通关
          G.phase = 'clear'; G.clearT = 2.0;
        }
      }
    }
  }

  // ===== AI 演示 =====
  function demoControl(dt) {
    const p = G.player;
    const spd = (CFG().demoSpd || 1);
    let ax = 0, ay = 0;
    // 威胁规避
    for (const b of G.ebullets) {
      const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy);
      if (d < 150 && d > 0.01) {
        const w = (150 - d) / 150;
        ax += dx / d * w * 260; ay += dy / d * w * 200;
      }
    }
    for (const e of G.enemies) {
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy);
      if (d < 90 && d > 0.01) { ax += dx / d * 120; ay += (dy / d) * 60; }
    }
    if (G.boss && !G.boss.dying) {
      const dx = p.x - G.boss.x, dy = p.y - G.boss.y, d = Math.hypot(dx, dy);
      if (d < G.boss.w * 0.55) { ax += dx / (d || 1) * 200; ay += dy / (d || 1) * 140; }
    }
    // 收道具
    let tgt = null, td = 200;
    for (const o of G.powers) {
      if (o.kind === 'coin') continue;
      const d = Math.hypot(o.x - p.x, o.y - p.y);
      if (d < td) { td = d; tgt = o; }
    }
    if (tgt && ax * ax + ay * ay < 9000) { ax += (tgt.x - p.x) * 2.4; ay += (tgt.y - p.y) * 2.4; }
    // 对准敌群
    const near = nearestEnemies(p.x, 0, 400, 1)[0];
    if (near && Math.abs(ax) < 60) ax += clamp(near.x - p.x, -90, 90) * 1.6;
    // 走位节奏
    ax += Math.sin(G.t * 1.3) * 34;
    if (Math.abs(ay) < 40) ay += Math.sin(G.t * 0.7) * 26 - 10;
    const sp = 300;
    p.tx = clamp(p.tx + clamp(ax, -sp, sp) * dt * spd, 22, W - 22);
    p.ty = clamp(p.ty + clamp(ay, -sp, sp) * dt * spd, H * 0.14, H - 60);
    // 炸弹
    G.demoBombT -= dt;
    const hpr = p.hp / p.maxHp;
    if (G.demoBombT <= 0 && p.bombs > 0 && ((hpr < 0.35) || (G.boss && hpr < 0.5))) { bomb(); G.demoBombT = 6; }
  }

  // ===== 主更新 =====
  function update(dtRaw) {
    FX().update(dtRaw);
    if (G.freeze > 0) { G.freeze -= dtRaw; return; }
    G.timeScale += (G.tsTarget - G.timeScale) * Math.min(1, dtRaw * 8);
    const dt = dtRaw * G.timeScale;
    if (!G.on || G.paused || G.phase === 'over') return;
    G.t += dt;
    const p = G.player, lp = G.lp, cfg = CFG();

    // --- 玩家 ---
    if (p.dead) {
      p.respawnT -= dt;
      if (p.respawnT <= 0 && p.lives >= 0) respawn();
    } else {
      keyboardMove(p, dt);
      if (G.demo) demoControl(dt);
      const ox = p.x;
      p.x += (p.tx - p.x) * Math.min(1, dt * 14);
      p.y += (p.ty - p.y) * Math.min(1, dt * 14);
      p.tilt += (clamp((p.x - ox) / Math.max(dt, 0.001) / 1200, -0.3, 0.3) - p.tilt) * Math.min(1, dt * 10);
      p.inv = Math.max(0, p.inv - dt);
      p.shield = Math.max(0, p.shield - dt);
      firePlayer(p, dt);
      fireWings(p, dt);
      if (rnd() < dt * 40) FX().trail(p.x + (rnd() - 0.5) * 6, p.y + 24, { color: '#35e0c8' });
      if (p.shield > 0 && rnd() < dt * 20) FX().trail(p.x + (rnd() - 0.5) * 40, p.y + (rnd() - 0.5) * 50, { color: '#7df0ff' });
    }

    // --- 连击窗口 ---
    if (G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) G.combo = 0; }

    // --- 波次导演 ---
    if (G.phase === 'play' && G.director && !G.director.done()) {
      G.director.tick(dt, makeApi(dt));
    }
    updateBossFlow(dt);
    if (G.phase === 'clear') {
      G.clearT -= dt;
      if (G.clearT <= 0 && !G.ended) { G.ended = true; settleRun(true); TF.UI && TF.UI.showSettle && TF.UI.showSettle(settleData(true)); }
    }

    // --- Boss ---
    if (G.boss) {
      const b = G.boss;
      if (b.dying) bossDeathTick(dt);
      else if (EN() && EN().BOSS) EN().BOSS.tick(b, dt, makeApi(dt));
    }

    // --- 敌机行为 ---
    for (let i = G.enemies.length - 1; i >= 0; i--) {
      const e = G.enemies[i];
      if (e.dead) { G.enemies.splice(i, 1); back('en', e); continue; }
      if (EN()) { EN().move(e, dt, makeApi(dt)); if (e.fire !== 'none') EN().fire(e, makeApi(dt)); }
      e.flash = Math.max(0, (e.flash || 0) - dt);
      e.kx = (e.kx || 0) * (1 - Math.min(1, dt * 8));
      if (e.y > H + 60 || e.x < -80 || e.x > W + 80) { e.dead = true; continue; }
      // 撞机
      if (!p.dead && p.inv <= 0 && Math.hypot(e.x - p.x, e.y - p.y) < e.size * 0.5 + 10) {
        playerHit(e.kind === 'elite' ? 26 : 20);
        if (e.kind !== 'elite') damageEnemy(e, 9999, false);
      }
    }

    // --- 玩家子弹 ---
    for (let i = G.bullets.length - 1; i >= 0; i--) {
      const b = G.bullets[i];
      b.t += dt;
      if (b.homing) {
        const t = nearestEnemies(b.x, b.y, 420, 1)[0];
        if (t) {
          const want = Math.atan2(t.y - b.y, t.x - b.x);
          const cur = Math.atan2(b.vy, b.vx);
          let d = want - cur; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
          const na = cur + clamp(d, -b.homing * dt, b.homing * dt);
          const sp = Math.min(560, Math.hypot(b.vx, b.vy) + 620 * dt);
          b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
        }
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.kind === 'missile' && rnd() < dt * 30) FX().trail(b.x, b.y, { color: '#ffb060' });
      let dead = b.y < -30 || b.y > H + 30 || b.x < -30 || b.x > W + 30 || b.t > (b.life || 4);
      if (!dead) {
        // vs 敌机
        for (const e of G.enemies) {
          if (e.dead) continue;
          if (Math.hypot(e.x - b.x, e.y - b.y) < e.size * 0.46 + b.r) {
            damageEnemy(e, b.dmg, b.kind !== 'bullet');
            FX().burst(b.x, b.y - 4, { kind: 'spark', n: 3, color: '#ffe9c0', spd: 120, size: 3, life: 0.2 });
            b.hits++;
            if (b.hits >= b.maxHits) dead = true;
            break;
          }
        }
        // vs Boss
        if (!dead && G.boss && !G.boss.dying) {
          const bo = G.boss;
          if (Math.abs(b.x - bo.x) < bo.w * 0.44 && Math.abs(b.y - bo.y) < 52) {
            damageBoss(b.dmg);
            FX().burst(b.x, b.y, { kind: 'spark', n: 3, color: '#ffd0a0', spd: 130, size: 3, life: 0.22 });
            SFX().play('bosshit', { vol: 0.25, rate: 0.9 + rnd() * 0.2 });
            dead = true;
          }
        }
      }
      if (dead) { G.bullets.splice(i, 1); back('pb', b); }
    }

    // --- 敌弹 ---
    const pbul = p.dead ? 0 : 1;
    for (let i = G.ebullets.length - 1; i >= 0; i--) {
      const b = G.ebullets[i];
      b.t += dt;
      if (b.homing) {
        const want = Math.atan2(p.y - b.y, p.x - b.x);
        const cur = Math.atan2(b.vy, b.vx);
        let d = want - cur; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
        const na = cur + clamp(d, -b.homing * dt, b.homing * dt);
        const sp = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < -40 || b.x > W + 40 || b.y < -60 || b.y > H + 40) { G.ebullets.splice(i, 1); back('eb', b); continue; }
      if (pbul) {
        const d = Math.hypot(b.x - p.x, b.y - p.y);
        if (p.inv <= 0 && !G.god && d < b.r + 7) {
          if (p.shield > 0) {
            FX().burst(b.x, b.y, { kind: 'star', n: 4, color: '#7df0ff', spd: 90, size: 3, life: 0.25 });
            G.ebullets.splice(i, 1); back('eb', b); SFX().play('graze', { rate: 0.6 }); continue;
          }
          G.ebullets.splice(i, 1); back('eb', b);
          playerHit(b.dmg); continue;
        }
        if (!b.grazed && d < b.r + 26 && p.inv <= 0) {
          b.grazed = true; G.grazeN++; G.score += 5;
          FX().burst(p.x + (b.x - p.x) * 0.4, p.y + (b.y - p.y) * 0.4, { kind: 'star', n: 2, color: '#e8fffa', spd: 70, size: 3, life: 0.2 });
          SFX().play('graze', { vol: 0.4 });
        }
      }
    }

    // --- 道具 ---
    for (let i = G.powers.length - 1; i >= 0; i--) {
      const o = G.powers[i];
      o.t += dt; o.y += o.vy * dt;
      const dx = p.x - o.x, dy = p.y - o.y, d = Math.hypot(dx, dy) || 1;
      const magR = p.shield > 0 ? 160 : 90;
      if (!p.dead && d < magR) { o.x += dx / d * 340 * dt; o.y += dy / d * 340 * dt; }
      else o.x += Math.sin(o.t * 2) * 14 * dt;
      if (!p.dead && d < 22) { applyPower(o.kind); FX().burst(o.x, o.y, { kind: 'star', n: 6, color: '#ffe9c0', spd: 100, size: 4, life: 0.3 }); G.powers.splice(i, 1); back('pw', o); continue; }
      if (o.y > H + 30) { G.powers.splice(i, 1); back('pw', o); }
    }

    // --- 光束/电弧残留 ---
    for (let i = G.beams.length - 1; i >= 0; i--) {
      const bm = G.beams[i]; bm.t += dt;
      if (bm.t > bm.dur) { G.beams.splice(i, 1); continue; }
      if (!p.dead && bm.hot && bm.t > bm.hotAt && bm.t < bm.hotAt + 0.2 && Math.abs(p.x - bm.x) < bm.w / 2 + 6 && p.y < bm.y) playerHit(24);
    }
    for (let i = G.zaps.length - 1; i >= 0; i--) { G.zaps[i].t -= dt; if (G.zaps[i].t <= 0) G.zaps.splice(i, 1); }
  }

  function settleRun(win) {
    const p = G.player;
    const stars = !win ? 0 : G.deaths === 0 && !G.revived ? (p.hp / p.maxHp > 0.6 ? 3 : 2) : 1;
    const rw = win ? L().reward(G.level, stars, p.hp / p.maxHp) : { coins: Math.round(G.coins * 0.5), parts: 0, scoreBonus: 0 };
    G.result = {
      win, stars, lv: G.level, score: G.score + (win ? rw.scoreBonus : 0),
      kills: G.kills, maxCombo: G.maxCombo, graze: G.grazeN,
      hpPct: p.hp / p.maxHp, coins: Math.round(G.coins + rw.coins), parts: G.parts + rw.parts,
      ship: p.ship.id, sec: Math.round(G.t), revived: G.revived,
      rewardCoins: rw.coins, rewardParts: rw.parts, scoreBonus: rw.scoreBonus,
      reviveCost: 300 + 200 * G.level,
    };
    L().PROFILE.addRun({ lv: G.level, score: G.result.score, kills: G.kills,
      coins: G.result.coins, parts: G.result.parts, win, stars, ship: p.ship.id, sec: G.result.sec });
    SFX().stopBGM();
    G.on = false;
  }
  function settleData() { return G.result; }

  // ===== 敌方 api（给 enemy 模块）=====
  let _api = null;
  function makeApi(dt) {
    const p = G.player, lp = G.lp, cfg = CFG();
    _api = _api || {};
    _api.W = W; _api.H = H; _api.dt = dt; _api.t = G.t;
    _api.player = { x: p.x, y: p.y, dead: p.dead };
    _api.rand = rnd;
    _api.diff = { hpK: lp.hpK * cfg.diff, spdK: lp.spdK, fireK: lp.fireK, densityK: lp.densityK };
    _api.spawn = (kind, x, y, o) => spawnEnemy(kind, x, y, o);
    _api.ebul = (x, y, ang, spd, o) => ebul(x, y, ang, spd, o);
    _api.ebulFan = (x, y, angs, spd, o) => { for (const a of angs) ebul(x, y, a, spd, o); };
    _api.telegraph = (x, y, w, dur, kind) => G.beams.push({ x, y, w, dur, t: 0, kind: kind || 'beam', hotAt: dur * 0.6, hot: true });
    _api.spawnPower = (x, y) => spawnPower(x, y, ['P', 'H', 'coin'][Math.floor(rnd() * 3)]);
    _api.sfx = (n, o) => SFX().play(n, o);
    _api.boss = G.boss;
    return _api;
  }
  function spawnEnemy(kind, x, y, o) {
    const def = L().ENEMIES.find(e => e.kind === kind); if (!def) return null;
    const e = take('en');
    const hpK = G.lp.hpK * CFG().diff;
    e.kind = kind; e.def = def;
    e.x = x; e.y = y !== undefined ? y : -40;
    e.x0 = e.x;
    e.hp = e.maxHp = Math.round(def.hp * hpK);
    e.size = def.size; e.score = def.score; e.coins = def.coins;
    e.speed = def.speed * G.lp.spdK;
    e.move = def.move; e.fire = def.fire; e.fireEvery = (def.fireEvery || 2) / Math.max(1, G.lp.fireK);
    e.fireT = 0.6 + rnd() * 1.2; e.t = 0; e.phase = rnd() * TAU;
    e.flash = 0; e.kx = 0; e.dead = false;
    e.o = o || {};
    G.enemies.push(e);
    return e;
  }
  function ebul(x, y, ang, spd, o) {
    if (G.ebullets.length > 340) return;
    o = o || {};
    const b = take('eb');
    b.x = x; b.y = y;
    b.vx = Math.cos(ang) * spd; b.vy = Math.sin(ang) * spd;
    b.r = o.r || 5; b.dmg = o.dmg || 14;
    b.kind = o.kind || 'eb'; b.homing = o.homing || 0;
    b.t = 0; b.grazed = false; b.life = o.life || 9;
    G.ebullets.push(b);
    return b;
  }

  // ===== 渲染 =====
  let lowHpVg = null;
  function render() {
    const c = ctx();
    const dpr = view.dpr, fit = view.fit;
    c.setTransform(dpr * fit, 0, 0, dpr * fit, 0, 0);
    // 背景
    c.fillStyle = '#05070d'; c.fillRect(0, 0, W, H);
    for (const l of bgLayers) {
      l.y = (l.y + l.spd / 60) % 256;
      if (l.big) { c.drawImage(l.c, 0, (l.y - 256) % 900, 420, 900); c.drawImage(l.c, 0, (l.y - 256) % 900 + 900, 420, 900); }
      else for (let y = l.y - 256; y < H; y += 256) for (let x = 0; x < W; x += 256) c.drawImage(l.c, x, y);
    }
    // 世界（含震屏）
    const off = FX().camOffset ? FX().camOffset() : { x: 0, y: 0 };
    c.save(); c.translate(off.x, off.y);

    // 光束预警
    for (const bm of G.beams) {
      const warn = bm.t < bm.hotAt;
      c.fillStyle = warn ? `rgba(255,90,60,${0.10 + 0.08 * Math.sin(bm.t * 20)})` : 'rgba(255,220,180,.85)';
      c.fillRect(bm.x - bm.w / 2, 0, bm.w, bm.y);
      if (!warn) { c.fillStyle = '#fff'; c.fillRect(bm.x - bm.w / 8, 0, bm.w / 4, bm.y); }
    }

    // 道具
    for (const o of G.powers) drawSprite(c, 'pw' + o.kind, (TF.ART && TF.ART.power ? TF.ART.power(o.kind) : null), o.x, o.y, 22, 22, Math.sin(o.t * 3) * 0.2, 0);

    // 敌机
    for (const e of G.enemies) {
      const key = 'en' + e.kind;
      drawSprite(c, key, TF.ART && TF.ART.enemy ? TF.ART.enemy(e.kind) : null,
        e.x + e.kx, e.y, e.size, e.size * (e.kind === 'kami' ? 1.3 : 1), e.tilt || 0, e.flash || 0);
    }

    // Boss
    if (G.boss) {
      const b = G.boss;
      drawSprite(c, 'boss' + b.i + '_' + b.v, TF.ART && TF.ART.boss ? TF.ART.boss(b.i, b.v) : null,
        b.x, b.y, b.w, b.w * 1.2, 0, b.flash || 0);
    }

    // 玩家 + 僚机
    const p = G.player;
    if (p && !p.dead) {
      const blink = p.inv > 0 && Math.floor(G.t * 14) % 2 === 0;
      if (!blink) {
        // 尾焰
        c.fillStyle = 'rgba(53,224,200,.7)';
        const fl = 14 + Math.sin(G.t * 40) * 5;
        c.beginPath(); c.moveTo(p.x - 4, p.y + 20); c.lineTo(p.x + 4, p.y + 20); c.lineTo(p.x, p.y + 20 + fl); c.closePath(); c.fill();
        drawSprite(c, 'ship' + p.ship.id, TF.ART && TF.ART.ship ? TF.ART.ship(p.ship.id) : null, p.x, p.y, 44, 54, p.tilt, 0);
        ['wl', 'wr'].forEach(k => {
          const wg = p[k]; if (!wg) return;
          drawSprite(c, 'wg' + wg.id, TF.ART && TF.ART.wing ? TF.ART.wing(wg.id) : null, wg.x, wg.y, 22, 22, 0, 0);
        });
        if (p.shield > 0) {
          c.strokeStyle = `rgba(125,240,255,${0.5 + 0.3 * Math.sin(G.t * 6)})`;
          c.lineWidth = 2;
          c.beginPath(); c.arc(p.x, p.y, 34, 0, TAU); c.stroke();
          c.fillStyle = 'rgba(125,240,255,.06)'; c.fill();
        }
      }
    }

    // 玩家子弹
    c.globalCompositeOperation = 'lighter';
    for (const b of G.bullets) {
      const s = b.kind === 'heavy' ? SPR.ph : b.kind === 'pierce' ? SPR.pp : b.kind === 'plasma' ? SPR.pp : b.kind === 'missile' ? SPR.ph : SPR.pb;
      if (b.kind === 'bullet' || b.kind === 'missile') {
        c.save(); c.translate(b.x, b.y); c.rotate(Math.atan2(b.vy, b.vx) + Math.PI / 2);
        c.drawImage(s, -s.width / 2 / 2, -s.height / 2 / 2, s.width / 2, s.height / 2);
        c.restore();
      } else c.drawImage(s, b.x - s.width / 4, b.y - s.height / 4, s.width / 2, s.height / 2);
    }
    // 敌弹
    for (const b of G.ebullets) {
      const s = b.kind === 'eb2' ? SPR.eb2 : b.kind === 'eb3' ? SPR.eb3 : SPR.eb;
      c.drawImage(s, b.x - s.width / 4, b.y - s.height / 4, s.width / 2, s.height / 2);
    }
    c.globalCompositeOperation = 'source-over';

    // 电弧
    for (const z of G.zaps) {
      c.strokeStyle = `rgba(160,240,255,${z.t / z.max})`;
      c.lineWidth = 2;
      c.beginPath();
      for (let i = 0; i < z.pts.length - 1; i++) {
        const [x1, y1] = z.pts[i], [x2, y2] = z.pts[i + 1];
        c.moveTo(x1, y1);
        c.lineTo((x1 + x2) / 2 + (rnd() - 0.5) * 10, (y1 + y2) / 2 + (rnd() - 0.5) * 10);
        c.lineTo(x2, y2);
      }
      c.stroke();
    }

    // Boss 预警
    if (G.bossPending) {
      const a = 0.5 + 0.5 * Math.sin(G.t * 12);
      c.fillStyle = `rgba(255,60,40,${0.08 + a * 0.07})`;
      c.fillRect(0, H * 0.32, W, 64);
      c.fillStyle = `rgba(255,90,60,${0.6 + a * 0.4})`;
      c.font = '800 30px ' + 'ui-monospace,Menlo,monospace';
      c.textAlign = 'center';
      c.fillText('W A R N I N G', W / 2, H * 0.32 + 42);
      c.font = '700 12px ' + 'ui-monospace,Menlo,monospace';
      c.fillStyle = 'rgba(255,176,160,.9)';
      c.fillText('⚠ 侦测到大型敌舰接近', W / 2, H * 0.32 + 60);
      c.textAlign = 'left';
    }

    // 特效（世界层）
    FX().render(c, 'world');
    c.restore();

    // 低血晕影
    if (p && !p.dead && p.hp / p.maxHp < 0.3) {
      if (!lowHpVg) {
        lowHpVg = document.createElement('canvas'); lowHpVg.width = 210; lowHpVg.height = 450;
        const x = lowHpVg.getContext('2d');
        const g = x.createRadialGradient(105, 225, 130, 105, 225, 300);
        g.addColorStop(0, 'rgba(255,30,10,0)'); g.addColorStop(1, 'rgba(255,30,10,.5)');
        x.fillStyle = g; x.fillRect(0, 0, 210, 450);
      }
      c.globalAlpha = 0.5 + 0.3 * Math.sin(G.t * 5);
      c.drawImage(lowHpVg, 0, 0, W, H);
      c.globalAlpha = 1;
    }
    // 特效（屏幕层）
    FX().render(c, 'screen');
  }

  // ===== 循环（rAF + setInterval 双驱动，防遮挡/无头节流冻结）=====
  let _raf = 0, _last = 0, _iv = 0;
  function tick(now) {
    const dt = Math.min(0.05, (now - _last) / 1000 || 0.016);
    _last = now;
    const fc0 = performance.now();
    try { update(dt); render(); } catch (err) {
      if (window.__errs) window.__errs.push('game:' + err.message);
    }
    G.frameCost = G.frameCost ? G.frameCost * 0.95 + (performance.now() - fc0) * 0.05 : (performance.now() - fc0);
    if (TF.UI && TF.UI.hudTick) TF.UI.hudTick(G);
  }
  function frame(now) {
    _raf = requestAnimationFrame(frame);
    tick(now);
  }
  function startLoop() {
    if (_raf) return;
    _last = performance.now();
    _raf = requestAnimationFrame(frame);
    _iv = setInterval(() => { // rAF 被节流时补步进（细分防穿隧）
      if (document.hidden) return;
      const now = performance.now();
      const gap = now - _last;
      if (gap > 180) {
        const steps = Math.min(4, Math.ceil(gap / 50));
        for (let i = 0; i < steps; i++) tick(_last + gap / steps * (i + 1));
      }
    }, 120);
  }
  function pause() { if (G.on) G.paused = true; }
  function resume() { G.paused = false; _last = performance.now(); }
  function stop() {
    G.on = false; G.paused = false;
    SFX().stopBGM();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.on && !G.paused && G.phase === 'play') { G.paused = true; TF.UI && TF.UI.autoPaused && TF.UI.autoPaused(); }
  });

  // ===== 复活（每局一次，币）=====
  function revive() {
    if (!G.result || G.result.revived || G.phase !== 'over') return false;
    const cost = G.result.reviveCost;
    const pf = L().PROFILE.get();
    if (pf.coins < cost) return false;
    pf.coins -= cost; L().PROFILE.save();
    const p = G.player;
    G.revived = true; G.ended = false; G.phase = 'play'; G.on = true; G.paused = false;
    p.dead = false; p.lives = 1; p.hp = p.maxHp; p.bombs = Math.max(p.bombs, 2);
    p.x = p.tx = W / 2; p.y = p.ty = H - 130; p.inv = 3.5; p.power = Math.max(1, p.power);
    G.ebullets.length = 0; G.enemies.forEach(e => { if (e.kind !== 'elite') e.dead = true; });
    SFX().startBGM(G.boss ? 'boss' : 'battle');
    return true;
  }

  // ===== 导出 =====
  return {
    start, pause, resume, stop, bomb, resize, revive, startLoop, bindInput,
    get state() { return G; },
    setDemo(v) { G.demo = v; },
    setGod(v) { G.god = v; },
    addCoin(v) { G.coins += v; },
    forceBoss() { // 调试：跳过波次直达 Boss
      if (G.director && G.director.finish) G.director.finish();
      G.enemies.forEach(e => e.dead = true);
    },
    setPower(v) { if (G.player) G.player.power = clamp(v, 0, 4); },
    _kill() { const p = G.player; if (p && !p.dead) { p.inv = 0; p.shield = 0; playerHit(99999); } },
    W, get H() { return H; },
  };
})();
