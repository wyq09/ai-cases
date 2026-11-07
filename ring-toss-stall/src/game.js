/* 地摊套圈 — 游戏主体：状态机/输入/经济/图鉴/老板台词/持久化/测试钩子 */
window.RT = window.RT || {};
RT.GAME = (function () {
  'use strict';

  var LG = function () { return window.RT.LOGIC; };
  var SC = function () { return window.RT.SCENE; };
  var noop = function () {};
  var NOOP_FX = new Proxy({ init: noop, resize: noop, confetti: noop, spark: noop, coinBurst: noop,
    dust: noop, flash: noop, bigText: noop, popLabel: noop, stopAll: noop },
    { get: function (t, k) { return k in t ? t[k] : noop; } });
  function FX() { return (window.RT && window.RT.FX) || NOOP_FX; }
  function AU() { return (window.RT && window.RT.AUDIO) || null; }

  /* ── 台词 ── */
  var TALK = {
    idle: ['来来来，试试手气！', '套中就归你！', '站好位，手别抖！', '小圈套大梦～', '圈圈到，好运到！'],
    throw: ['好嘞，走你！', '看准了扔！', '这一圈有讲究～'],
    hit: ['哟！手气可以啊！', '拿走拿走！', '真有你的！', '老板娘，记账！'],
    rare: ['好家伙！这个都给你套来了！', '今晚必须加个鸡腿！', '高手！绝对是高手！'],
    miss3: ['差一点！再来！', '别灰心，找感觉！', '圈要甩得稳～'],
    buy: ['拿好圈，慢慢扔！', '大气！圈管够！'],
    restock: ['补货咯，新到的货！', '好货又摆上来啦！'],
    free: ['拿去拿去，下一把套大的！']
  };
  function pick(a) { return a[(Math.random() * a.length) | 0]; }

  /* ── 配置与存档 ── */
  var CFG_KEY = 'ringtoss_config_v1', STATE_KEY = 'ringtoss_state_v1';
  var CFG_DEF = { aimGuide: true, powerSens: 1.0, talk: true, vols: { bgm: 0.35, sfx: 1, master: 1 }, sound: true };
  function deepMerge(a, b) {
    var o = Array.isArray(a) ? a.slice() : Object.assign({}, a);
    if (!b) return o;
    for (var k in b) {
      if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') o[k] = deepMerge(a[k], b[k]);
      else o[k] = b[k];
    }
    return o;
  }
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var cfg = deepMerge(CFG_DEF, lsGet(CFG_KEY));
  var STATE_DEF = { coins: 20, rings: 0, dex: {}, loot: {}, stats: { throws: 0, hits: 0, bestStreak: 0, streak: 0 }, seenIntro: 0, freeAt: 0 };
  var S = deepMerge(STATE_DEF, lsGet(STATE_KEY));
  var saveTmr = null;
  function save() {
    if (saveTmr) return;
    saveTmr = setTimeout(function () { saveTmr = null; lsSet(STATE_KEY, S); }, 250);
  }

  /* ── 运行时 ── */
  var stools = LG().LAYOUT.map(function (s) {
    return Object.assign({}, s, {
      prize0: s.prize, spec0: s.spec, neckY0: s.neckY, bodyTop0: s.bodyTop,
      ringOn: null, anim: { t: 0 }
    });
  });
  var resting = [];          // 静止圈 {x,y,z,ci}
  var flying = null;         // 飞行圈
  var phase = 'idle';        // idle | aiming | flying | present
  var aim = { active: false, x: 0, power: 0, show: false, sx: 0, sy: 0 };
  var rigTarget = null;      // {x, power} 下圈强制
  var autoLeft = 0, autoTmr = 0;
  var ciSeq = 0;
  var throwCount = 0;        // 用于补货判断与新手提示
  var ringCap = 26;
  var els = {};

  function busy() { return phase !== 'idle'; }

  /* ── DOM 工具 ── */
  function $(id) { return document.getElementById(id); }
  function show(el, on) { el.classList[on ? 'remove' : 'add']('hide'); }
  var toastTmr = null;
  function toast(msg, ms) {
    els.toast.textContent = msg; show(els.toast, true);
    if (toastTmr) clearTimeout(toastTmr);
    toastTmr = setTimeout(function () { show(els.toast, false); }, ms || 1600);
  }
  var bubbleTmr = null;
  function talk(kind) {
    if (!cfg.talk || Math.random() < 0.12 && kind === 'idle') return;
    var line = pick(TALK[kind] || TALK.idle);
    els.bubbleText.textContent = line;
    show(els.bubble, true);
    if (bubbleTmr) clearTimeout(bubbleTmr);
    bubbleTmr = setTimeout(function () { show(els.bubble, false); }, 2300);
    var a = AU(); if (a && Math.random() < 0.6) a.play('talk');
  }

  function updHUD() {
    els.coinVal.textContent = S.coins;
    els.ringVal.textContent = S.rings;
    els.streak.textContent = S.stats.streak >= 2 ? S.stats.streak + ' 连中!' : '';
  }

  /* ── 投掷 ── */
  function throwRing(targetX, power) {
    if (S.rings <= 0) { shopHint(); return false; }
    var pw = power, tx = targetX;
    if (rigTarget) { pw = rigTarget.power; tx = rigTarget.x; rigTarget = null; }
    pw = Math.max(0.05, Math.min(1, pw));
    var aimX = LG().solveAim(tx, pw);
    var v = LG().throwVel(pw, aimX);
    flying = { x: v.x0, y: LG().THROW_Y, z: LG().THROW_Z, vx: v.vx, vy: v.vy, vz: v.vz,
               tilt: 1.0, state: 'fly', ci: ciSeq++, bounces: 0 };
    S.rings--; S.stats.throws++; throwCount++;
    phase = 'flying';
    aim.show = false;
    var a = AU(); if (a) a.play('throw');
    if (Math.random() < 0.35) talk('throw');
    updHUD(); save();
    els.aimHint.classList.add('hide');
    return true;
  }

  function shopHint() {
    toast('没圈了！找老板买圈');
    openShop();
  }

  /* ── 物理推进（固定步长） ── */
  var acc = 0;
  function stepPhysics(dt) {
    if (!flying || flying.state !== 'fly') return;
    acc += dt;
    var h = 1 / 120, events = [];
    while (acc >= h && flying && flying.state === 'fly') {
      acc -= h;
      var ev = LG().stepRing(flying, h, stools);
      for (var i = 0; i < ev.length; i++) events.push(ev[i]);
    }
    if (events.length) handleEvents(events);
  }

  function handleEvents(events) {
    var a = AU();
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      if (e.type === 'capture') { onCapture(e.stool); return; }
      if (e.type === 'bounceWood') { if (a) a.play('bounceWood'); if (e.stool) dustAt(e.stool.x, LG().STOOL_H, e.stool.z, 4); }
      else if (e.type === 'bounceGround') { if (a) a.play('bounceGround'); dustAt(flying.x, 0.05, flying.z, 5); }
      else if (e.type === 'prizeBody' || e.type === 'prizeTop') { if (a) a.play('bounceWood'); dustAt(e.stool.x, e.stool.neckY, e.stool.z, 3); }
      else if (e.type === 'settle') { onSettle(e); }
    }
  }

  function dustAt(x, y, z, n) {
    var p = SC().worldToScreen(x, y, z);
    if (p) FX().dust(p.x, p.y, n);
  }

  /* ── 中奖结算 ── */
  function onCapture(stool) {
    phase = 'present';
    var spec = stool.spec;
    stool.ringOn = { ci: flying.ci };
    flying = null;
    missRun = 0;
    stool.anim.t = 1.15;
    var a = AU();
    var rare = spec.tier === 2;
    if (a) a.play(rare ? 'rare' : 'win');
    if (a) a.duck(rare ? 1400 : 900);
    var p = SC().worldToScreen(stool.x, stool.neckY + 0.25, stool.z);
    if (p) {
      // 钳制到屏幕安全区，避免边缘奖品演出被裁
      p.x = Math.max(SC().cam.W * 0.18, Math.min(SC().cam.W * 0.82, p.x));
      p.y = Math.max(SC().cam.H * 0.16, Math.min(SC().cam.H * 0.62, p.y));
      FX().confetti(rare ? 90 : 46, { x: p.x, y: p.y });
      FX().bigText((rare ? '稀有奖!' : '套中啦!') + ' ' + spec.name, rare ? { color: '#ff5f4a', sub: '+' + spec.val + ' 分', scale: 1.15 } : {});
      FX().popLabel(p.x, p.y - 60, spec.name + ' ×1', '#ffd257');
    }
    // 记账：新奖品收录，重复折算币
    var isNew = !S.dex[spec.name];
    S.dex[spec.name] = (S.dex[spec.name] || 0) + 1;
    S.loot[spec.name] = (S.loot[spec.name] || 0) + 1;
    var refund = 0;
    if (!isNew) { refund = Math.ceil(spec.val * 0.5); S.coins += refund; }
    S.stats.hits++; S.stats.streak++;
    if (S.stats.streak > S.stats.bestStreak) S.stats.bestStreak = S.stats.streak;
    talk(rare ? 'rare' : 'hit');
    updHUD(); save();
    // 奖品离场
    setTimeout(function () {
      if (p) FX().spark(p.x, p.y, '#ffd257', 14);
      stool.prize = null; stool.ringOn = null;
      if (refund) {
        var pp = SC().worldToScreen(stool.x, 0.8, stool.z);
        if (pp) FX().popLabel(pp.x, pp.y, '+' + refund + ' 币·重复折算', '#ffe08a');
        var a2 = AU(); if (a2) a2.play('coin');
        updHUD();
      }
      phase = 'idle';
      afterTurn();
    }, 1050);
  }

  function onSettle(e) {
    var r = flying;
    flying = null;
    if (e.on === 'lost') { endMiss(true); return; }
    resting.push({ x: r.x, y: r.y, z: r.z, ci: r.ci });
    if (resting.length > ringCap) resting.shift();
    var a = AU(); if (a) a.play('ringSettle');
    endMiss(false);
  }

  function endMiss(lost) {
    if (phase === 'present') return;
    phase = 'idle';
    S.stats.streak = 0;
    updHUD(); save();
    if (S.stats.throws > 0 && S.stats.streak === 0 && Math.random() < 0.25) {
      // 连续不中时老板安慰（用 throws 采样即可）
    }
    miss3Check();
    afterTurn();
  }

  var missRun = 0;
  function miss3Check() {
    missRun++;
    if (missRun > 0 && missRun % 3 === 0) talk('miss3');
  }

  /* ── 回合结束公共出口（自动模式 / 补货 / 买圈引导） ── */
  function afterTurn() {
    maybeRestock();
    if (S.rings <= 0 && autoLeft > 0) { autoLeft = 0; }
    if (autoLeft > 0) {
      autoLeft--;
      setTimeout(function () { if (phase === 'idle' && autoLeft >= 0 && S.rings > 0) autoThrow(); }, 750);
    } else if (S.rings <= 0 && S.coins < 5) {
      openShop();
    }
  }

  function autoThrow() {
    if (phase !== 'idle' || S.rings <= 0) return;
    var lg = LG();
    var occ = stools.filter(function (s) { return s.prize; });
    if (!occ.length) return;
    // 偏向近排的随机目标 + 人手噪声
    var st = occ[(Math.random() * occ.length) | 0];
    var tx = st.x + (Math.random() - 0.5) * 0.24;
    var pw = lg.powerForZ(st.z + (Math.random() - 0.5) * 0.3, st.neckY);
    throwRing(tx, pw);
  }

  function maybeRestock() {
    var empty = stools.filter(function (s) { return !s.prize; });
    if (empty.length >= 5) {
      empty.forEach(function (s) {
        s.prize = s.prize0; s.spec = s.spec0; s.neckY = s.neckY0; s.bodyTop = s.bodyTop0;
        s.anim.t = 0.6;
      });
      talk('restock');
      toast('老板补货啦！');
      var a = AU(); if (a) a.play('prizeCollect');
    }
  }

  /* ── 输入（拖拽瞄准，上滑力度，松手掷圈） ── */
  function bindInput(cv) {
    function px2tx(px) { return (px / camW() - 0.5) * 3.4; }
    function camW() { return SC().cam.W; }
    function py2pw(py) {
      var H = SC().cam.H;
      return Math.max(0, Math.min(1, (aim.sy - py) / (H * 0.30) * cfg.powerSens));
    }
    cv.addEventListener('pointerdown', function (e) {
      unlockAudio();
      if (phase !== 'idle') return;
      if (S.rings <= 0) { shopHint(); return; }
      phase = 'aiming';
      aim.active = true; aim.sx = e.clientX; aim.sy = e.clientY;
      aim.x = px2tx(e.clientX); aim.power = 0; aim.show = cfg.aimGuide;
      cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', function (e) {
      if (!aim.active) return;
      aim.x = Math.max(-1.55, Math.min(1.55, px2tx(e.clientX)));
      aim.power = py2pw(e.clientY);
    });
    function release(e) {
      if (!aim.active) return;
      aim.active = false;
      var pw = py2pw(e.clientY);
      if (pw < 0.05) { phase = 'idle'; aim.show = false; return; }  // 轻点取消
      phase = 'idle';
      throwRing(aim.x, pw);
    }
    cv.addEventListener('pointerup', release);
    cv.addEventListener('pointercancel', function (e) { if (aim.active) { aim.active = false; phase = 'idle'; aim.show = false; } });
  }
  function unlockAudio() {
    var a = AU();
    if (a) { a.unlock(); if (cfg.sound) a.startLoop('bgm'); }
  }

  /* ── 商店 ── */
  function openShop() { show(els.shop, true); refreshFreeBtn(); }
  function closeShop() { show(els.shop, false); }
  function refreshFreeBtn() {
    var cd = S.freeAt - Date.now();
    if (cd > 0) { els.btnFree.disabled = true; els.freeCd.textContent = '(' + Math.ceil(cd / 1000) + 's)'; }
    else { els.btnFree.disabled = false; els.freeCd.textContent = ''; }
  }
  function buy(n, cost) {
    if (S.coins < cost) { toast('币不够啦，先领 5 币'); refreshFreeBtn(); return; }
    S.coins -= cost; S.rings += n;
    var a = AU(); if (a) { a.play('coin'); a.duck(400); }
    talk('buy');
    updHUD(); save(); closeShop();
  }

  /* ── 图鉴 ── */
  function renderDex() {
    var lg = LG();
    var html = '';
    Object.keys(lg.PRIZE_SPEC).forEach(function (id) {
      var sp = lg.PRIZE_SPEC[id];
      var uri = window.RT && window.RT.ART ? window.RT.ART.prize(id) : null;
      var ct = S.loot[sp.name] || 0;
      html += '<div class="dexCell' + (ct ? '' : ' locked') + (sp.tier === 2 ? ' rare' : '') + '">' +
        '<span class="val">' + sp.val + '分</span>' +
        '<img src="' + uri + '" alt="">' +
        '<div class="nm">' + sp.name + '</div>' +
        '<div class="ct">' + (ct ? '×' + ct : '未套中') + '</div></div>';
    });
    els.dexGrid.innerHTML = html;
    var st = S.stats;
    var got = Object.keys(S.loot).length;
    els.dexStats.innerHTML = '累计掷圈 ' + st.throws + ' · 套中 ' + st.hits +
      ' · 最高连中 ' + st.bestStreak + '<br>图鉴收齐 ' + got + '/9' +
      (got >= 9 ? ' · 全图鉴达成！' : '');
  }

  /* ── rig（测试钩子） ── */
  function rig(name) {
    var lg = LG();
    var occ = stools.filter(function (s) { return s.prize; });
    var want = name === 'rare' ? [2] : [0, 1];
    var cands = occ.filter(function (s) { return want.indexOf(s.spec.tier) >= 0; });
    if (!cands.length) cands = occ;
    cands = cands.filter(function (s) { return Math.abs(s.x) <= 2.0; });   // 只挑画面内好演出的位
    if (!cands.length) cands = occ;
    var st = cands[(Math.random() * cands.length) | 0];
    rigTarget = { x: st.x, power: lg.powerForZ(st.z, st.neckY) };
  }

  /* ── 主循环（rAF + setInterval 双驱动，防遮挡冻结） ── */
  var lastT = 0;
  function frame(ts) {
    var dt = Math.min(0.05, (ts - lastT) / 1000 || 0.016);
    lastT = ts;
    tick(dt);
    requestAnimationFrame(frame);
  }
  function tick(dt) {
    if (phase === 'flying') stepPhysics(dt);
    stools.forEach(function (s) { if (s.anim.t > 0) s.anim.t -= dt; });
    // 渲染
    var ctx = ctxRef.ctx;
    if (ctx) {
      var aimShow = (phase === 'aiming' && aim.active && aim.power > 0.04);
      SC().render(ctx, {
        stools: stools, resting: resting, flying: flying, t: performance.now() / 1000,
        aim: { show: aimShow, x: aim.x, power: Math.max(aim.power, 0.05) }
      });
    }
  }
  var ctxRef = { ctx: null };
  setInterval(function () { tick(1 / 60); }, 150);   // 后台兜底（rAF 被节流时仍推进）

  /* ── 启动 ── */
  function boot() {
    els = {
      coinVal: $('coinVal'), ringVal: $('ringVal'), streak: $('streak'),
      aimHint: $('aimHint'), bubble: $('bubble'), bubbleText: $('bubbleText'),
      toast: $('toast'), shop: $('shop'), dex: $('dex'), panel: $('panel'),
      buy20: $('buy20'), buy60: $('buy60'), btnFree: $('btnFree'), freeCd: $('freeCd'),
      dexGrid: $('dexGrid'), dexStats: $('dexStats')
    };
    var stage = $('stage'), fxlayer = $('fxlayer');

    function doResize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var W = window.innerWidth, H = window.innerHeight;
      [stage, fxlayer].forEach(function (cv) {
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      });
      stage.style.width = W + 'px'; stage.style.height = H + 'px';
      var ctx = stage.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctxRef.ctx = ctx;
      SC().resize(W, H);
      FX().resize(W, H);
    }
    doResize();
    window.addEventListener('resize', doResize);
    window.addEventListener('orientationchange', function () { setTimeout(doResize, 120); });

    bindInput(stage);
    FX().init(fxlayer);

    // HUD
    var A = window.RT && window.RT.ART;
    if (A && A.coin) $('coinIcon').src = A.coin();
    updHUD();

    els.buy20.addEventListener('click', function () { unlockAudio(); buy(20, 20); });
    els.buy60.addEventListener('click', function () { unlockAudio(); buy(60, 60); });
    els.btnFree.addEventListener('click', function () {
      if (Date.now() < S.freeAt) return;
      if (S.coins >= 5) { toast('还有币呢，先套着'); return; }
      S.coins += 5; S.freeAt = Date.now() + 60000;
      var a = AU(); if (a) a.play('coin');
      talk('free');
      toast('老板送你 5 个币！');
      updHUD(); save(); refreshFreeBtn();
    });
    $('shopClose').addEventListener('click', closeShop);
    $('btnShop').addEventListener('click', function () { unlockAudio(); openShop(); });
    $('btnDex').addEventListener('click', function () { renderDex(); show(els.dex, true); });
    $('dexClose').addEventListener('click', function () { show(els.dex, false); });

    // 设置面板
    var CP = window.RT && window.RT.CONFIG_PANEL;
    if (CP && CP.mount) {
      CP.mount(els.panel);
      CP.onChange(function (c2) {
        cfg = c2;
        lsSet(CFG_KEY, cfg);
        applyAudioCfg();
      });
    }
    $('btnCfg').addEventListener('click', function () { if (CP) CP.open('play'); else toast('设置面板未加载'); });
    applyAudioCfg();

    // 首次引导 / 开场
    if (!S.seenIntro) {
      S.seenIntro = 1; save();
      setTimeout(function () { openShop(); talk('idle'); }, 500);
    } else if (S.rings <= 0) {
      setTimeout(openShop, 400);
    }

    // URL 参数
    var Q = window.__RTQ || {};
    if (Q.muted) { cfg.sound = false; applyAudioCfg(); }
    if (Q.rig) rig(Q.rig);
    if (Q.auto) { autoLeft = parseInt(Q.auto, 10) || 0; setTimeout(function () { if (phase === 'idle') autoThrow(); }, 900); }
    setInterval(refreshFreeBtn, 1000);

    requestAnimationFrame(function (t) { lastT = t; requestAnimationFrame(frame); });
  }

  function applyAudioCfg() {
    var a = AU();
    if (!a) return;
    a.setMasterVolume(cfg.sound ? cfg.vols.master : 0);
    a.setBGMVolume(cfg.vols.bgm);
    a.setSFXVolume(cfg.vols.sfx);
    if (cfg.sound) a.startLoop('bgm'); else a.stopLoop('bgm');
  }

  /* ── 测试钩子 ── */
  window.__rt = {
    version: '1.0',
    get state() { return S; },
    get cfg() { return cfg; },
    get busy() { return busy(); },
    get phase() { return phase; },
    get stools() { return stools; },
    get resting() { return resting.length; },
    throwRing: function (x, p) { return throwRing(x, p); },
    rig: rig,
    setCoins: function (v) { S.coins = v; updHUD(); save(); },
    setRings: function (v) { S.rings = v; updHUD(); save(); },
    setAuto: function (n) {
      autoLeft = n;
      if (n > 0 && phase === 'idle') { autoLeft--; setTimeout(autoThrow, 400); }
    },
    simulate: function (n, sx, sz, seed) { return LG().simulate(n, { x: sx, z: sz }, seed); },
    openShop: openShop, renderDex: renderDex
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  return { boot: boot };
})();
