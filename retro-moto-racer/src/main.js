/* retro-moto-racer — main.js  状态机 / 渲染 / 输入 / HUD / 持久化 / 测试钩子
 * 模块引用一律惰性（RM.X && ...），缺模块不炸。URL 参数：?reset=1 ?muted=1 ?auto=1 ?stage=1..3 ?pos=n ?crt=0 ?skip=1
 */
(function () {
  var RM = window.RM = window.RM || {};
  var L = RM.LOGIC;
  var VERSION = '1.0.0';

  // ---------- URL 参数 ----------
  var Q = {};
  location.search.replace(/^\?/, '').split('&').forEach(function (kv) {
    var p = kv.split('=');
    Q[decodeURIComponent(p[0])] = p[1] === undefined ? true : decodeURIComponent(p[1]);
  });

  // ---------- 配置与存档 ----------
  var DEF_CFG = {
    sound: { master: 0.9, bgm: 0.5, sfx: 0.9, bgmTrack: 'sunrise' },
    video: { crt: true, crtIntensity: 0.55, scanlines: true, particles: 1, shake: true },
    race: { difficulty: 'normal', checkpointTime: 18, nitroFill: 1, rubberband: true, autoThrottle: true, steerMode: 'drag', steerSens: 1 },
    player: { tag: 'P1', colorway: 0 }
  };
  function deepMerge(dst, src) {
    for (var k in src) {
      if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) {
        dst[k] = deepMerge(dst[k] && typeof dst[k] === 'object' ? dst[k] : {}, src[k]);
      } else dst[k] = src[k];
    }
    return dst;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function loadJSON(key) {
    try { var s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
  var cfg = deepMerge(clone(DEF_CFG), loadJSON('rm_cfg_v1') || {});
  var state = deepMerge({ races: 0, wins: 0, bestPos: 0, bestTotal: 0, stageBest: [0, 0, 0] }, loadJSON('rm_state_v1') || {});
  function saveCfg() { try { localStorage.setItem('rm_cfg_v1', JSON.stringify(cfg)); } catch (e) {} }
  function saveState() { try { localStorage.setItem('rm_state_v1', JSON.stringify(state)); } catch (e) {} }
  if (Q.muted) cfg.sound.master = 0;

  // ---------- 画布 ----------
  var cv = document.getElementById('game');
  var ctx = cv.getContext('2d');
  var W = 480, H = 270;
  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    if (w >= h) { W = 480; H = Math.max(232, Math.min(300, Math.round(480 * h / w))); }
    else { H = 480; W = Math.max(232, Math.min(300, Math.round(480 * w / h))); }
    cv.width = W; cv.height = H;
    ctx.imageSmoothingEnabled = false;
    RM.FX && RM.FX.resize(W, H);
  }
  window.addEventListener('resize', resize);

  // ---------- 关卡调色板（与契约 §6 一致，渲染用） ----------
  var STAGES = [
    { name: 'SUNSET DESERT', bg: 0, fog: '#e8a06a',
      sand1: '#d88d43', sand2: '#c07a38', road1: '#5e5158', road2: '#544b55',
      rumA: '#d94f3d', rumB: '#efe6d8', rumRA: '#e8823c', rumRB: '#efe6d8',
      laneY: '#ffd23f', laneW: '#f2ede4', night: 0 },
    { name: 'CANYON DUSK', bg: 1, fog: '#c07050',
      sand1: '#b06a38', sand2: '#985c2f', road1: '#54494f', road2: '#4a4149',
      rumA: '#b03a30', rumB: '#d8cfc2', rumRA: '#c06a2c', rumRB: '#d8cfc2',
      laneY: '#e8b83a', laneW: '#d8d2c4', night: 0 },
    { name: 'MOJAVE NIGHT', bg: 2, fog: '#3a2a55',
      sand1: '#4a3550', sand2: '#3e2c45', road1: '#3e3a46', road2: '#363240',
      rumA: '#8a3040', rumB: '#b8b0b8', rumRA: '#a05828', rumRB: '#b8b0b8',
      laneY: '#c8a838', laneW: '#b8b4ac', night: 1 }
  ];
  function hex2rgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function lerpColor(a, b, t) {
    var A = hex2rgb(a), B = hex2rgb(b);
    return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' + Math.round(A[1] + (B[1] - A[1]) * t) + ',' + Math.round(A[2] + (B[2] - A[2]) * t) + ')';
  }
  function mixPal(sA, sB, t) { // t=0 全 A
    if (t <= 0) return sA; if (t >= 1) return sB;
    var out = {};
    for (var k in sA) {
      if (typeof sA[k] === 'string' && sA[k][0] === '#') out[k] = lerpColor(sA[k], sB[k], t);
      else if (typeof sA[k] === 'number') out[k] = sA[k] + (sB[k] - sA[k]) * t;
      else out[k] = t < 0.5 ? sA[k] : sB[k];
    }
    return out;
  }

  // ---------- 世界尺寸表（sprite 世界宽度，单位同 roadWidth） ----------
  var WORLD_W = { bike: 215, barrel: 100, cactus: 260, rock: 330, bush: 230, sign: 420, light: 150, arch: 4700 };
  var PROP_SPR = { barrel: 'barrel', cactus: 'cactus', rock: 'rock', bush: 'bush', sign: 'sign', light: 'light' };

  // ---------- 游戏状态 ----------
  var phase = 'boot';           // boot|title|countdown|racing|stagewin|finish|timeup|paused|results
  var prevPhase = null;
  var race = null, attract = null;
  var cdT = 0, swT = 0, finT = 0, tuT = 0;
  var banners = [];
  var ping = 66, pingT = 0;
  var palMix = 1, palFrom = 0;  // 换关调色过渡
  var offroadDustT = 0, flameT = 0;
  var bgOff = [0, 0, 0, 0];     // 天空/远山/近岩/沙丘 视差
  var hudFlash = 0;             // 超越闪
  var lastRank = 0;

  function banner(l1, l2, dur) { banners.push({ l1: l1, l2: l2 || '', t: 0, dur: dur || 1.6 }); }

  function decorateTrack(track) {
    var segs = track.segs;
    if (segs[4]) segs[4].props.push({ id: 'arch', kind: 'start', off: 0 });
    track.cps.forEach(function (c) { if (segs[c]) segs[c].props.push({ id: 'arch', kind: 'checkpoint', off: 0 }); });
    var fi = Math.floor(track.len / L.SEG_LEN) - 2;
    if (segs[fi]) segs[fi].props.push({ id: 'arch', kind: 'finish', off: 0 });
  }

  function makeRace(stage, startRank) {
    var r = L.newRace(stage, {
      difficulty: cfg.race.difficulty, startRank: startRank || 8,
      cpTime: cfg.race.checkpointTime, nitroFill: cfg.race.nitroFill,
    });
    r.cfgRubber = !!cfg.race.rubberband;
    decorateTrack(r.track);
    return r;
  }

  // ---------- 输入 ----------
  var input = { steer: 0, throttle: 1, brake: 0, nitro: 0 };
  var keys = {};
  var drag = { on: false, id: -1, startX: 0, target: 0 };
  var btnNitro = false, btnBrake = false, halfSteer = 0, halfId = -1;

  function assembleInput() {
    if (Q.auto && (phase === 'racing' || phase === 'stagewin' || phase === 'countdown')) {
      var a = L.autoDrive(race);
      return { steer: a.steer, throttle: a.throttle, brake: a.brake, nitro: a.nitro };
    }
    var steer = 0, sens = cfg.race.steerSens || 1;
    if (keys.ArrowLeft || keys.KeyA) steer = -1;
    if (keys.ArrowRight || keys.KeyD) steer = 1;
    if (!steer && halfSteer) steer = halfSteer;
    if (!steer && drag.on && race) {
      steer = Math.max(-1, Math.min(1, (drag.target - race.playerX) * 5 * sens));
    }
    var throttle = (cfg.race.autoThrottle || keys.ArrowUp || keys.KeyW) ? 1 : 0;
    var brake = (keys.ArrowDown || keys.KeyS || btnBrake) ? 1 : 0;
    var nitro = (keys.ShiftLeft || keys.ShiftRight || keys.Space || btnNitro) ? 1 : 0;
    return { steer: steer, throttle: throttle, brake: brake, nitro: nitro };
  }

  // ---------- 状态迁移 ----------
  function setBodyState() {
    var b = document.body;
    b.className = b.className.replace(/state-\S+/g, '').trim();
    b.classList.add('state-' + (phase === 'stagewin' || phase === 'finish' || phase === 'timeup' ? 'racing' : phase));
    if (Q.touch || 'ontouchstart' in window || navigator.maxTouchPoints > 0 ||
        (window.matchMedia && matchMedia('(pointer: coarse)').matches)) b.classList.add('touch');
  }

  function toTitle() {
    phase = 'title'; setBodyState();
    hideOverlay();
    race = null;
    if (!attract) newAttract();
    RM.AUDIO && RM.AUDIO.engineStop();
    RM.AUDIO && RM.AUDIO.bgm('menu');
  }

  function newAttract() {
    attract = makeRace(0, 6);
    attract.phase = 'racing'; attract.timeLeft = 999;
  }

  function startRace(stage) {
    hideOverlay();
    stage = Math.max(0, Math.min(2, stage | 0));
    race = makeRace(stage, Q.pos ? (parseInt(Q.pos, 10) || 8) : 8);
    race.startRank = race.rank;
    phase = 'countdown'; cdT = 3.6; setBodyState();
    lastRank = race.rank;
    banners.length = 0;
    palMix = 1; palFrom = race.stage;
    RM.AUDIO && RM.AUDIO.bgmStop();
    RM.AUDIO && RM.AUDIO.bgm(race.stage < 2 ? bgmId(cfg.sound.bgmTrack) : bgmId(otherTrack(cfg.sound.bgmTrack)));
    RM.AUDIO && RM.AUDIO.engineStart();
  }

  function bgmId(t) { return t === 'midnight' ? 'race2' : 'race1'; }
  function otherTrack(t) { return t === 'midnight' ? 'sunrise' : 'midnight'; }

  function pauseRace() {
    if (phase !== 'racing' && phase !== 'stagewin' && phase !== 'countdown') return;
    prevPhase = phase; phase = 'paused'; setBodyState();
    showOverlay('paused');
    RM.AUDIO && RM.AUDIO.engineUpdate(0, false);
  }
  function resumeRace() {
    if (phase !== 'paused') return;
    phase = prevPhase || 'racing'; setBodyState();
    hideOverlay();
  }
  function quitRace() { toTitle(); }

  function onStagewin() {
    phase = 'stagewin'; setBodyState();
    swT = 0;
    banner('STAGE CLEAR', race.stage < 2 ? 'TIME +20S' : '');
    RM.AUDIO && RM.AUDIO.play('checkpoint');
  }
  function advanceStage() {
    race.stage++;
    var tr = L.buildTrack(race.stage, 41 + race.stage * 100);
    race.track = tr; race.segs = tr.segs; race.n = tr.n;
    decorateTrack(tr);
    var sorted = L.rank(race);                    // 按当前名次重排发车
    for (var i = 0; i < sorted.length; i++) {
      var r = sorted[i];
      r.z = 8 * L.SEG_LEN + Math.floor(i / 2) * 2.6 * L.SEG_LEN;
      r.x = (i % 2 ? 0.5 : -0.5); r.targetX = r.x; r.speed = Math.min(r.speed, L.MAX_SPEED * 0.6);
    }
    race.z = race.player.z; race.playerX = race.player.x;
    race.cpNext = 0; race.stageT = 0;
    race.timeLeft += 20;
    race.nitro = Math.min(100, race.nitro + 30);
    race.phase = 'racing';
    phase = 'racing'; setBodyState();
    palFrom = race.stage - 1; palMix = 0;         // 调色过渡 1.2s
    banner('STAGE ' + (race.stage + 1), STAGES[race.stage].name, 2);
    RM.AUDIO && RM.AUDIO.play('stage');
    RM.AUDIO && RM.AUDIO.bgm(race.stage < 2 ? bgmId(cfg.sound.bgmTrack) : bgmId(otherTrack(cfg.sound.bgmTrack)));
  }
  function beginFinish() {
    race.phase = 'finish'; phase = 'finish'; finT = 0; setBodyState();
    race.stageTimes.push(race.stageT);
    banner('FINISH!', '', 2.2);
    RM.AUDIO && RM.AUDIO.play('finish');
    for (var i = 0; i < 3; i++) {
      (function (i) { setTimeout(function () { RM.FX && race && RM.FX.spawn('confetti', 0, 0, { n: 26, x: 0, y: 0, w: W }); }, i * 350); })(i);
    }
  }
  function onTimeup() {
    phase = 'timeup'; tuT = 0; setBodyState();
    banner('TIME UP!', '', 2);
    RM.AUDIO && RM.AUDIO.play('timeup');
  }

  // ---------- 结算 ----------
  function fmtTime(t) {
    var m = Math.floor(t / 60), s = Math.floor(t % 60), cs = Math.floor((t * 100) % 100);
    return m + "'" + (s < 10 ? '0' : '') + s + '"' + (cs < 10 ? '0' : '') + cs;
  }
  function ordinal(n) { return n + (n === 1 ? 'ST' : n === 2 ? 'ND' : n === 3 ? 'RD' : 'TH'); }
  function showResults(finished) {
    phase = 'results'; setBodyState();
    var arr = L.rank(race);
    var pos = race.rank, total = race.time;
    state.races++;
    if (finished) { if (pos === 1) state.wins++; if (!state.bestPos || pos < state.bestPos) state.bestPos = pos; }
    if (!state.bestTotal || total < state.bestTotal) state.bestTotal = total;
    var sb = state.stageBest[race.stage] || 0;
    var newRec = finished && (!sb || race.stageT < sb);
    if (finished && newRec) state.stageBest[race.stage] = race.stageT;
    saveState();
    var rows = '';
    for (var i = 0; i < race.stageTimes.length; i++) {
      rows += '<div class="sub" style="margin:0">STAGE ' + (i + 1) + ' — ' + fmtTime(race.stageTimes[i]) + (state.stageBest[i] ? '  (BEST ' + fmtTime(state.stageBest[i]) + ')' : '') + '</div>';
    }
    var recLine = newRec ? '<div class="sub" style="color:#ffd23f;margin:0">★ NEW STAGE RECORD</div>' : '';
    showOverlay('results', {
      title: finished ? 'FINISH!' : 'RESULT',
      body: '<div class="sub" style="font-size:17px;color:#ffd23f;margin:0 0 4px">' + ordinal(pos) + ' / 12</div>' +
        rows + '<div class="sub" style="margin:2px 0 0">TOTAL — ' + fmtTime(total) + '</div>' + recLine,
      buttons: [
        { label: 'RETRY', fn: function () { startRace(race.stage); } },
        { label: 'TITLE', fn: function () { toTitle(); } }
      ]
    });
    RM.AUDIO && RM.AUDIO.engineStop();
  }

  // ---------- DOM 覆盖层 ----------
  var overlay = document.getElementById('overlay');
  function showOverlay(kind, data) {
    var html = '';
    if (kind === 'paused') {
      html = '<div class="dlg"><h1>PAUSE</h1><div class="btns">' +
        '<button class="mbtn primary" data-a="resume">RESUME</button>' +
        '<button class="mbtn" data-a="retry">RESTART STAGE</button>' +
        '<button class="mbtn" data-a="cfg">SETTINGS</button>' +
        '<button class="mbtn" data-a="quit">QUIT TO TITLE</button></div></div>';
    } else if (kind === 'results') {
      html = '<div class="dlg"><h1>' + data.title + '</h1>' + (data.body || '') + '<div class="btns" style="margin-top:12px">' +
        '<button class="mbtn primary" data-a="retry">RETRY</button>' +
        '<button class="mbtn" data-a="quit">TITLE</button></div></div>';
    } else if (kind === 'timeup') {
      html = '<div class="dlg"><h1 style="color:#ff6a5a">TIME UP</h1><div class="sub">倒计时归零，检查点前没能赶到。</div><div class="btns">' +
        '<button class="mbtn primary" data-a="retry">RETRY STAGE</button>' +
        '<button class="mbtn" data-a="quit">TITLE</button></div></div>';
    }
    overlay.innerHTML = html;
    overlay.classList.add('show');
    overlay.dataset.kind = kind;
  }
  function hideOverlay() { overlay.classList.remove('show'); overlay.innerHTML = ''; }
  overlay.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-a]');
    if (!b) return;
    var a = b.dataset.a;
    RM.AUDIO && RM.AUDIO.play('click');
    if (a === 'resume') resumeRace();
    else if (a === 'retry') startRace(race ? race.stage : 0);
    else if (a === 'cfg') RM.CFGP && RM.CFGP.open();
    else if (a === 'quit') toTitle();
  });

  var toast = document.getElementById('toast');
  var toastT = null;
  function showToast(msg) {
    toast.textContent = msg; toast.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { toast.classList.remove('show'); }, 1800);
  }

  // ---------- 事件消费 ----------
  function consumeEvents(r) {
    var evs = r.events; r.events = [];
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      if (e.t === 'checkpoint') {
        banner('CHECKPOINT', '+' + L.cpTime(r) + 'S');
        RM.AUDIO && RM.AUDIO.play('checkpoint');
        r.timeFlash = 0.9;
      } else if (e.t === 'stagewin') onStagewin();
      else if (e.t === 'timeup') onTimeup();
      else if (e.t === 'bump') {
        RM.AUDIO && RM.AUDIO.play('bump');
        RM.FX && RM.FX.spawn('spark', W / 2, H * 0.78, { n: 14, power: 1 });
        RM.FX && RM.FX.shake(4);
      } else if (e.t === 'barrel') {
        RM.AUDIO && RM.AUDIO.play('barrel');
        RM.FX && RM.FX.spawn('dust', W / 2, H * 0.84, { n: 12, spread: 26 });
        RM.FX && RM.FX.spawn('spark', W / 2, H * 0.8, { n: 6, power: 0.6 });
        RM.FX && RM.FX.shake(6);
      }
    }
  }

  // ---------- 更新 ----------
  function update(dt) {
    // 假 ping 随机游走（复古氛围）
    pingT -= dt;
    if (pingT <= 0) { pingT = 1.2 + Math.random(); ping = Math.max(48, Math.min(96, ping + Math.round((Math.random() - 0.5) * 14))); }

    for (var i = banners.length - 1; i >= 0; i--) { banners[i].t += dt; if (banners[i].t > banners[i].dur) banners.splice(i, 1); }
    if (hudFlash > 0) hudFlash -= dt;
    if (palMix < 1) palMix = Math.min(1, palMix + dt / 1.2);

    if (phase === 'title') {
      if (attract) {
        var ai = L.autoDrive(attract);
        L.stepPlayer(attract, ai, dt);
        L.stepAI(attract, dt);
        consumeEvents(attract);
        if (attract.phase === 'stagewin' || attract.phase === 'timeup') newAttract();
      }
      return;
    }
    if (phase === 'paused' || phase === 'results') return;

    if (phase === 'countdown') {
      var before = Math.ceil(cdT - 0.5);
      cdT -= dt;
      var after = Math.ceil(cdT - 0.5);
      if (after !== before && after >= 1 && after <= 3) RM.AUDIO && RM.AUDIO.play('count');
      if (cdT <= 0.5 && !race.goFired) {
        race.goFired = true; race.phase = 'racing';
        phase = 'racing'; setBodyState();
        RM.AUDIO && RM.AUDIO.play('go');
        banner('GO!', '', 1);
      }
      L.stepAI(race, dt);
      return;
    }

    if (phase === 'racing' || phase === 'stagewin' || phase === 'finish' || phase === 'timeup') {
      var sdt = dt;
      if (phase === 'finish') { finT += dt; sdt = dt * Math.max(0.25, 1 - finT / 1.2); if (finT > 1.6) { showResults(true); return; } }
      if (phase === 'timeup') { tuT += dt; if (tuT > 1.4 && !overlay.classList.contains('show')) { showOverlay('timeup'); RM.AUDIO && RM.AUDIO.engineStop(); } }

      var inp = assembleInput();
      L.stepPlayer(race, inp, sdt);
      L.stepAI(race, sdt);
      consumeEvents(race);
      var prevR = lastRank; L.rank(race);
      if (prevR && race.rank < prevR) hudFlash = 0.6;
      lastRank = race.rank;

      if (phase === 'stagewin') {
        swT += dt;
        if (swT > 1.6) { if (race.stage < 2) advanceStage(); else beginFinish(); }
      }

      // 离路扬尘
      var off = Math.abs(race.playerX) > 1.05 && race.speed > 900;
      if (off) {
        offroadDustT -= dt;
        if (offroadDustT <= 0) {
          offroadDustT = 0.07;
          RM.FX && RM.FX.spawn('dust', W / 2 + (race.playerX > 0 ? 1 : -1) * W * 0.06, H * 0.9, { n: 2, spread: 8, vy: -30 });
        }
      }
      // 高速气流线
      if (race.speed / L.MAX_SPEED > 0.86 && Math.random() < 0.3) {
        RM.FX && RM.FX.spawn('speedline', 0, H * (0.2 + Math.random() * 0.5), { side: Math.random() < 0.5 ? 0 : 1 });
      }
      // 引擎声
      RM.AUDIO && RM.AUDIO.engineUpdate(Math.min(1, race.speed / L.MAX_SPEED), race.nitroOn);
      RM.FX && RM.FX.update(sdt);
      return;
    }
  }

  // ---------- 渲染 ----------
  function poly(x1, y1, x2, y2, x3, y3, x4, y4, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4);
    ctx.closePath(); ctx.fill();
  }
  function drawTile(img, off, y, hMix) {
    if (!img) return;
    var w = img.width, x = -(((off % w) + w) % w);
    while (x < W) { ctx.drawImage(img, Math.round(x), Math.round(y)); x += w; }
  }

  function drawBackdrop(pal, t) {
    var art = RM.ART; if (!art) return;
    var bd = art.backdrop(race ? race.stage : 0);
    var py = race ? race.player.yCur || 0 : 0;
    var horY = Math.round(H * 0.42 - py * 0.002);
    if (pal.night) { drawTile(bd.sky, bgOff[0] * 0.2, 0); }
    else drawTile(bd.sky, bgOff[0] * 0.2, 0);
    if (bd.sun) drawTile(bd.sun, bgOff[0] * 0.3, horY - (bd.sun.height || 40) + 4);
    if (bd.mesasFar) drawTile(bd.mesasFar, bgOff[1], horY - (bd.mesasFar.height || 50) + 6);
    if (bd.mesasNear) drawTile(bd.mesasNear, bgOff[2], horY - (bd.mesasNear.height || 40) + 12);
    if (bd.dunes) drawTile(bd.dunes, bgOff[3], horY - 6);
  }

  function project(p, camX, camY, camZ) {
    p.camera.x = (p.world.x || 0) - camX;
    p.camera.y = (p.world.y || 0) - camY;
    p.camera.z = (p.world.z || 0) - camZ;
    p.screen.scale = L.CAM_DEPTH / p.camera.z;
    p.screen.x = Math.round((W / 2) + (p.screen.scale * p.camera.x * W / 2));
    p.screen.y = Math.round((H / 2) - (p.screen.scale * p.camera.y * H / 2));
    p.screen.w = Math.round((p.screen.scale * L.ROAD_W * W / 2));
  }

  function expFog(d, density) { return 1 / Math.pow(Math.E, d * d * density); }

  function renderRoad(dt) {
    var segs = race.segs, n = race.n, pal = curPal();
    var baseIdx = Math.floor(race.z / L.SEG_LEN) % n;
    var base = segs[baseIdx];
    var basePercent = (race.z % L.SEG_LEN) / L.SEG_LEN;
    var pz = race.z + L.PLAYER_Z;
    var pSeg = segs[Math.floor(pz / L.SEG_LEN) % n];
    var pPct = (pz % L.SEG_LEN) / L.SEG_LEN;
    var playerY = pSeg.p1.world.y + (pSeg.p2.world.y - pSeg.p1.world.y) * pPct;
    race.player.yCur = playerY;

    // 视差推进
    var sp = race.speed / L.MAX_SPEED;
    var crv = base.curve * basePercent;
    bgOff[0] += crv * sp * dt * 12; bgOff[1] += crv * sp * dt * 34;
    bgOff[2] += crv * sp * dt * 70; bgOff[3] += crv * sp * dt * 120;

    drawBackdrop(pal);

    var maxy = H, x = 0, dx = -(base.curve * basePercent);
    var camX = race.playerX * L.ROAD_W;
    var visible = [];
    var i, seg, s1, s2;
    for (i = 0; i < L.DRAW_DIST; i++) {
      var idx = baseIdx + i;
      if (idx >= n) break;
      seg = segs[idx];
      seg.fog = expFog(i / L.DRAW_DIST, L.FOG_D);
      seg.clip = maxy;
      var loopZ = 0;
      project(seg.p1, camX - x, playerY + L.CAM_H, race.z - loopZ);
      project(seg.p2, camX - x - dx, playerY + L.CAM_H, race.z - loopZ);
      x += dx; dx += seg.curve;
      s1 = seg.p1.screen; s2 = seg.p2.screen;
      if (seg.p1.camera.z <= L.CAM_DEPTH || s2.y >= s1.y || s2.y >= maxy) continue;

      renderSegment(seg, pal);
      visible.push(seg);
      maxy = s1.y;
    }
    return visible;
  }

  function curPal() {
    var A = STAGES[palFrom], B = STAGES[race ? race.stage : 0];
    return mixPal(A, B, palMix);
  }

  function renderSegment(seg, pal) {
    var s1 = seg.p1.screen, s2 = seg.p2.screen;
    var light = seg.color === 'light';
    // 沙地
    ctx.fillStyle = light ? pal.sand1 : pal.sand2;
    ctx.fillRect(0, s2.y, W, s1.y - s2.y);
    var rw1 = Math.max(1, s1.w / 7), rw2 = Math.max(1, s2.w / 7);
    var lm = Math.max(1, Math.round(s1.w / 52)), lm2 = Math.max(1, Math.round(s2.w / 52));
    // 路缘：左红白 / 右橙白
    poly(s1.x - s1.w - rw1, s1.y, s1.x - s1.w, s1.y, s2.x - s2.w, s2.y, s2.x - s2.w - rw2, s2.y, light ? pal.rumA : pal.rumB);
    poly(s1.x + s1.w + rw1, s1.y, s1.x + s1.w, s1.y, s2.x + s2.w, s2.y, s2.x + s2.w + rw2, s2.y, light ? pal.rumRA : pal.rumRB);
    // 路面
    poly(s1.x - s1.w, s1.y, s1.x + s1.w, s1.y, s2.x + s2.w, s2.y, s2.x - s2.w, s2.y, light ? pal.road1 : pal.road2);
    // 中央双黄线
    var cy1 = s1.w * 0.02, cy2 = s2.w * 0.02;
    if (s1.w > 24) {
      poly(s1.x - cy1 - lm, s1.y, s1.x - cy1 + lm, s1.y, s2.x - cy2 + lm2, s2.y, s2.x - cy2 - lm2, s2.y, pal.laneY);
      poly(s1.x + cy1 - lm, s1.y, s1.x + cy1 + lm, s1.y, s2.x + cy2 + lm2, s2.y, s2.x + cy2 - lm2, s2.y, pal.laneY);
      // ±半车道白虚线
      if (Math.floor(seg.index / 3) % 2 === 0) {
        var d1 = s1.w * 0.5, d2 = s2.w * 0.5;
        poly(s1.x - d1 - lm, s1.y, s1.x - d1 + lm, s1.y, s2.x - d2 + lm2, s2.y, s2.x - d2 - lm2, s2.y, pal.laneW);
        poly(s1.x + d1 - lm, s1.y, s1.x + d1 + lm, s1.y, s2.x + d2 + lm2, s2.y, s2.x + d2 - lm2, s2.y, pal.laneW);
      }
    }
    // 雾
    if (seg.fog < 1) {
      ctx.globalAlpha = 1 - seg.fog;
      ctx.fillStyle = pal.fog;
      ctx.fillRect(0, s2.y, W, s1.y - s2.y + 1);
      ctx.globalAlpha = 1;
    }
  }

  function drawSprite(spr, seg, worldW, destX, leanFrame, tint) {
    if (!spr || !seg) return;
    var s = seg.p1.screen;
    var destW = Math.round(s.scale * worldW * W / 2);
    if (destW < 2) return;
    var destH = Math.round(destW * spr.height / spr.width);
    var clipY = seg.clip;
    var x = Math.round((destX !== undefined ? destX : s.x) - destW / 2);
    var y = Math.round(s.y - destH);
    if (clipY < y + destH) {
      var sh = destH;
      if (y + destH > clipY) sh = clipY - y;
      if (sh > 0) ctx.drawImage(spr, 0, 0, spr.width, spr.height * (sh / destH), x, y, destW, sh);
      // 影子
      if (worldW < 1000 && destW > 6) {
        ctx.fillStyle = 'rgba(20,10,20,0.32)';
        ctx.fillRect(x + destW * 0.12, Math.min(y + destH, clipY) - 1, destW * 0.76, Math.max(1, Math.round(destH * 0.07)));
      }
    }
  }

  function renderSprites(visible) {
    var art = RM.ART; if (!art) return;
    var map = {};
    var i, r;
    for (i = 0; i < race.riders.length; i++) {
      r = race.riders[i]; if (r.isPlayer) continue;
      var idx = Math.floor(r.z / L.SEG_LEN) % race.n;
      (map[idx] = map[idx] || []).push(r);
    }
    for (i = visible.length - 1; i >= 0; i--) {
      var seg = visible[i];
      // 道具
      for (var j = 0; j < seg.props.length; j++) {
        var pr = seg.props[j];
        var sx = seg.p1.screen.x + seg.p1.screen.scale * pr.off * L.ROAD_W * W / 2;
        if (pr.id === 'arch') drawSprite(art.arch(pr.kind), seg, WORLD_W.arch, sx);
        else drawSprite(art.prop(PROP_SPR[pr.id]), seg, WORLD_W[pr.id], sx);
      }
      // 对手
      var list = map[seg.index];
      if (list) {
        for (var k = 0; k < list.length; k++) {
          var rr = list[k];
          var rx = seg.p1.screen.x + seg.p1.screen.scale * rr.x * L.ROAD_W * W / 2;
          var lean = Math.max(-2, Math.min(2, Math.round((rr.targetX - rr.x) * 6 + (rr.wobbleT > 0 ? Math.sin(rr.z * 0.05) * 1.5 : 0))));
          var spr = art.bike(rr.colorway, lean);
          drawSprite(spr, seg, WORLD_W.bike, rx);
        }
      }
    }
  }

  function renderPlayer(dt) {
    var art = RM.ART; if (!art || !race) return;
    var sp = race.speed / L.MAX_SPEED;
    var bounce = Math.sin(race.time * 21) * sp * 1.6 + (race.bumpT > 0 ? Math.sin(race.time * 60) * 2 : 0);
    var lean = Math.max(-2, Math.min(2, Math.round(race.steerLean * 2)));
    var spr = art.bike(playerColorIdx(), lean);
    var dh = Math.round(H * 0.29), dw = Math.round(dh * spr.width / spr.height);
    var px = Math.round(W / 2 + race.steerLean * W * 0.015 - dw / 2);
    var py = Math.round(H * 0.965 + bounce);
    // 氮气尾焰
    if (race.nitroOn) {
      flameT += dt;
      var fl = art.flame(Math.floor(flameT * 14) % 2);
      if (fl) {
        var fh = Math.max(4, Math.round(dh * 0.22));
        ctx.drawImage(fl, px + Math.round(dw * 0.30), py - fh, Math.max(3, Math.round(fh * fl.width / fl.height)), fh);
        ctx.drawImage(fl, px + Math.round(dw * 0.62), py - fh, Math.max(3, Math.round(fh * fl.width / fl.height)), fh);
      }
    }
    // 影子
    ctx.fillStyle = 'rgba(20,10,20,0.38)';
    ctx.fillRect(px + Math.round(dw * 0.1), py - 2, Math.round(dw * 0.8), 3);
    ctx.drawImage(spr, px, py - dh, dw, dh);
    // 夜关车头灯
    if (curPal().night && (phase === 'racing' || phase === 'stagewin')) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.15 + Math.sin(race.time * 30) * 0.008;
      ctx.fillStyle = '#fff2c0';
      ctx.beginPath();
      ctx.moveTo(W / 2 - dw * 0.22, py - dh * 0.5);
      ctx.lineTo(W / 2 + dw * 0.22, py - dh * 0.5);
      ctx.lineTo(W / 2 + W * 0.20, H * 0.40);
      ctx.lineTo(W / 2 - W * 0.20, H * 0.40);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  }

  // ---------- HUD ----------
  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(42,20,32,0.85)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#4a2432';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
  function cells(x, y, n, total, cw, ch, gap, onColor, flash) {
    for (var i = 0; i < total; i++) {
      ctx.fillStyle = i < n ? (flash && (Math.floor(Date.now() / 90) % 2) ? '#ffd23f' : onColor) : 'rgba(245,240,230,0.16)';
      ctx.fillRect(x + i * (cw + gap), y, cw, ch);
    }
  }
  function drawHUD(dt) {
    var F = RM.FONT; if (!F || !race) return;
    var pal = curPal();
    var m = Math.floor(H / 270); // HUD 缩放基准（竖屏 480 高时放大）
    var s1 = Math.max(1, m), s2 = Math.max(1, 2 * m), s3 = Math.max(2, 3 * m);
    var pad = 4;
    var isTouch = document.body.classList.contains('touch');
    var botRes = isTouch ? Math.round(84 * H / Math.max(400, window.innerHeight)) : 0; // 给 BRAKE/NITRO 按钮让位
    var Hb = H - botRes;

    // 左上 名次（窄屏收窄）
    var narrow = W < 300;
    var pw = narrow ? 62 : 70 * s1;
    panel(pad, pad, pw, 34 * s1);
    F.draw(ctx, String(race.rank), pad + 6 * s1, pad + 4 * s1, s3, hudFlash > 0 && (Math.floor(Date.now() / 120) % 2) ? '#f5f0e6' : '#ffd23f', 'left');
    F.draw(ctx, '/12', pad + 32 * s1, pad + 5 * s1, s1, '#f5f0e6', 'left');
    F.draw(ctx, 'POS', pad + 32 * s1, pad + 16 * s1, s1, '#f5f0e6', 'left');
    // 关卡进度细条
    var prog = Math.min(1, race.z / race.track.len);
    ctx.fillStyle = 'rgba(245,240,230,0.18)';
    ctx.fillRect(pad + 4 * s1, pad + 28 * s1, pw - 8 * s1, 3);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(pad + 4 * s1, pad + 28 * s1, Math.round((pw - 8 * s1) * prog), 3);

    // 顶中 全程进度条（3 关）
    var bw = Math.round(W * 0.5), bx = Math.round((W - bw) / 2);
    ctx.fillStyle = 'rgba(42,20,32,0.85)'; ctx.fillRect(bx, pad + 2 * s1, bw, 9 * s1);
    ctx.strokeStyle = '#4a2432'; ctx.strokeRect(bx + 0.5, pad + 2 * s1 + 0.5, bw - 1, 9 * s1 - 1);
    var tot = Math.min(1, (race.stage + prog) / 3);
    ctx.fillStyle = '#57d95c';
    ctx.fillRect(bx + 2, pad + 4 * s1, Math.round((bw - 4) * tot), 5 * s1);
    var flag = RM.ART && RM.ART.flag();
    if (flag) ctx.drawImage(flag, bx + bw - 9 * s1, pad + 3 * s1, 7 * s1, 7 * s1);

    // 右上 计时 + PING（触屏时给 DOM 暂停/齿轮按钮让出右侧条）
    var tstr = fmtTime(race.time);
    var reserve = document.body.classList.contains('touch') ? Math.round(96 * W / Math.max(320, window.innerWidth)) : 0;
    var tw = F.measure(tstr, s2) + 12 * s1;
    var trx = W - pad - reserve;
    panel(trx - tw, pad, tw, 20 * s1);
    F.draw(ctx, tstr, trx - 6 * s1, pad + 3 * s1, s2, race.timeFlash > 0 ? '#57d95c' : '#f5f0e6', 'right');
    F.draw(ctx, 'PING ' + ping, trx, pad + 24 * s1, s1, '#57d95c', 'right', '#241018');

    // 左下 氮气 + 速度
    var blw = 92 * s1;
    panel(pad, Hb - pad - 40 * s1, blw, 40 * s1);
    var nit = Math.round(race.nitro / 100 * 12);
    cells(pad + 5 * s1, Hb - pad - 35 * s1, nit, 12, 4 * s1, 5 * s1, s1, '#57d95c', race.nitroOn);
    F.draw(ctx, String(L.kmh(race.speed)), pad + 5 * s1, Hb - pad - 26 * s1, s3, '#f5f0e6', 'left');
    F.draw(ctx, 'KM/H', pad + (narrow ? 46 : 44) * s1, Hb - pad - 12 * s1, s1, '#f5f0e6', 'left');

    // 底中 TAG + 名次 + 名次格（并入左下一行；窄屏省略，名次已在左上）
    if (!narrow) {
      var bcw = Math.max(100, Math.min(Math.round(W * 0.30), W - pad * 2 - blw - brw - 20 * s1));
      var bcx = pad + blw + 8 * s1;
      panel(bcx, Hb - pad - 34 * s1, bcw, 34 * s1);
      F.draw(ctx, cfg.player.tag, bcx + 6 * s1, Hb - pad - 29 * s1, s1, '#57d95c', 'left');
      F.draw(ctx, ordinal(race.rank), bcx + bcw - 6 * s1, Hb - pad - 31 * s1, s2, '#f5f0e6', 'right');
      var rc = 13 - race.rank;
      cells(bcx + 5 * s1, Hb - pad - 12 * s1, rc, 12, Math.floor((bcw - 12 * s1) / 12) - 1, 5 * s1, 1, '#57d95c', hudFlash > 0);
    }

    // 右下 RIDER / BIKE（窄屏收窄为 10 格）
    var brw = narrow ? 96 * s1 : 114 * s1;
    var nCells = narrow ? 10 : 14;
    panel(W - pad - brw, Hb - pad - 40 * s1, brw, 40 * s1);
    F.draw(ctx, 'RIDER', W - pad - brw + 5 * s1, Hb - pad - 35 * s1, s1, '#f5f0e6', 'left');
    cells(W - pad - brw + (narrow ? 34 : 42) * s1, Hb - pad - 35 * s1, Math.ceil(race.stamina / 100 * nCells), nCells, 4 * s1, 5 * s1, 1, '#f2b53d', race.stamina < 25);
    F.draw(ctx, 'BIKE', W - pad - brw + 5 * s1, Hb - pad - 20 * s1, s1, '#f5f0e6', 'left');
    cells(W - pad - brw + (narrow ? 34 : 42) * s1, Hb - pad - 20 * s1, Math.ceil(race.condition / 100 * nCells), nCells, 4 * s1, 5 * s1, 1, '#3f8fd9', race.condition < 25);

    if (race.timeFlash > 0) race.timeFlash -= dt;
  }

  function drawBanners() {
    var F = RM.FONT; if (!F || !banners.length) return;
    var b = banners[banners.length - 1];
    var t = b.t;
    var scaleIn = t < 0.14 ? t / 0.14 : 1;
    var fade = t > b.dur - 0.3 ? Math.max(0, (b.dur - t) / 0.3) : 1;
    var cx = W / 2, cy = Math.round(H * 0.30);
    var s = Math.max(2, Math.round(H / 270) * 4 * scaleIn);
    ctx.globalAlpha = fade;
    F.draw(ctx, b.l1, cx + 2, cy + 2, s, '#241018', 'center');
    F.draw(ctx, b.l1, cx, cy, s, '#ffd23f', 'center');
    if (b.l2) F.draw(ctx, b.l2, cx, cy + s * 9, Math.max(1, Math.round(s / 2.4)), '#f5f0e6', 'center');
    ctx.globalAlpha = 1;
  }

  function drawCountdown() {
    var F = RM.FONT; if (!F) return;
    var n = Math.ceil(cdT - 0.5);
    if (cdT > 0.5 && n >= 1 && n <= 3) {
      var frac = 1 - ((cdT - 0.5) % 1);
      var s = Math.round((H / 270) * (5 + frac * 1.2));
      F.draw(ctx, String(n), W / 2 + 2, Math.round(H * 0.3) + 2, s, '#241018', 'center');
      F.draw(ctx, String(n), W / 2, Math.round(H * 0.3), s, '#ffd23f', 'center');
    }
  }

  function renderTitle(dt) {
    // 吸引模式背景
    if (attract) { race = attract; renderRace(dt, true); race = null; }
    else { ctx.fillStyle = '#1a0e18'; ctx.fillRect(0, 0, W, H); }
    ctx.fillStyle = 'rgba(16,6,14,0.42)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(16,6,14,0.38)';
    ctx.fillRect(0, Math.round(H * 0.47), W, H - H * 0.47);
    var F = RM.FONT, art = RM.ART;
    var m = Math.max(1, Math.round(H / 270));
    if (art && art.logo) {
      var lg = art.logo();
      var lw = Math.min(Math.round(W * 0.86), Math.round(H * 0.34 * lg.width / lg.height));
      var lh = Math.round(lw * lg.height / lg.width);
      ctx.drawImage(lg, Math.round((W - lw) / 2), Math.round(H * 0.09), lw, lh);
    } else if (F) {
      F.draw(ctx, 'SUNSET RIDE', W / 2, Math.round(H * 0.2), 4 * m, '#ffd23f', 'center', '#241018');
    }
    if (F) {
      if (Math.floor(Date.now() / 500) % 2) F.draw(ctx, 'TAP TO START', W / 2, Math.round(H * 0.52), 2 * m, '#f5f0e6', 'center', '#241018');
      F.draw(ctx, '12 RIDERS / 3 STAGES / CHECKPOINT TIMER', W / 2, Math.round(H * 0.62), 1 * m, '#c8a8b8', 'center', '#241018');
      if (state.bestTotal) F.draw(ctx, 'BEST ' + fmtTime(state.bestTotal) + (state.bestPos ? '  ·  ' + ordinal(state.bestPos) : ''), W / 2, Math.round(H * 0.68), 1 * m, '#57d95c', 'center', '#241018');
      F.draw(ctx, 'DRAG=STEER  NITRO=TURBO', W / 2, Math.round(H - 12 * m), 1 * m, '#8a6a7a', 'center', '#241018');
    }
  }

  function renderRace(dt, noHud) {
    ctx.fillStyle = curPal().fog;
    ctx.fillRect(0, 0, W, H);
    var visible = renderRoad(dt);
    renderSprites(visible);
    renderPlayer(dt);
    RM.FX && RM.FX.draw(ctx);
    if (!noHud) { drawHUD(dt); drawBanners(); if (phase === 'countdown') drawCountdown(); }
  }

  function playerColorIdx() { return [0, 2, 3, 11][cfg.player.colorway | 0] || 0; }

  // ---------- 主循环（rAF + setInterval 双驱动） ----------
  var lastT = 0, rafId = 0;
  function frame(now) {
    rafId = requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - lastT) / 1000 || 0.016);
    lastT = now;
    try { tick(dt, now); } catch (e) { if (window.__errs) __errs.push('game:' + String(e.message).slice(0, 160) + ' @' + String(e.stack || '').split('\n')[1]); }
  }
  function tick(dt, now) {
    if (phase !== 'paused' && phase !== 'results') update(dt);
    if (phase === 'title') renderTitle(dt);
    else if (race) renderRace(dt);
    else { ctx.fillStyle = '#1a0e18'; ctx.fillRect(0, 0, W, H); }
  }
  setInterval(function () {
    if (document.hidden) return;
    var gap = performance.now() - lastT;
    if (gap > 180) {
      var steps = Math.min(6, Math.ceil(gap / 50));
      for (var i = 0; i < steps; i++) {
        try { tick(0.05, performance.now()); } catch (e) { if (window.__errs) __errs.push('game:' + String(e.message).slice(0, 160)); }
      }
      lastT = performance.now();
    }
  }, 120);

  // ---------- 输入绑定 ----------
  var app = document.getElementById('app');
  function isUI(t) { return !!(t && t.closest && t.closest('#ui button, #overlay, #panelHost, #swatches')); }
  app.addEventListener('pointerdown', function (e) {
    RM.AUDIO && RM.AUDIO.unlock();
    if (isUI(e.target)) return;
    if (phase === 'title') { RM.AUDIO && RM.AUDIO.play('click'); startRace(Q.stage ? parseInt(Q.stage, 10) - 1 : 0); return; }
    if (phase === 'racing' || phase === 'stagewin' || phase === 'countdown') {
      if (cfg.race.steerMode === 'buttons') {
        if (halfId === -1) { halfId = e.pointerId; halfSteer = e.clientX < window.innerWidth / 2 ? -1 : 1; }
      } else if (!drag.on) {
        drag.on = true; drag.id = e.pointerId; drag.startX = e.clientX;
        drag.target = race ? race.playerX : 0;
      }
    }
  });
  app.addEventListener('pointermove', function (e) {
    if (drag.on && e.pointerId === drag.id && race) {
      var dx = (e.clientX - drag.startX) / Math.max(120, window.innerWidth * 0.12);
      drag.target = race.playerX + dx * 1.5;
    }
  });
  function pointerEnd(e) {
    if (drag.on && e.pointerId === drag.id) { drag.on = false; drag.id = -1; }
    if (e.pointerId === halfId) { halfId = -1; halfSteer = 0; }
  }
  app.addEventListener('pointerup', pointerEnd);
  app.addEventListener('pointercancel', pointerEnd);

  function bindHold(id, set) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('pointerdown', function (e) { e.preventDefault(); RM.AUDIO && RM.AUDIO.unlock(); set(true); });
    el.addEventListener('pointerup', function () { set(false); });
    el.addEventListener('pointerleave', function () { set(false); });
    el.addEventListener('pointercancel', function () { set(false); });
  }
  bindHold('btn-nitro', function (v) { btnNitro = v; });
  bindHold('btn-brake', function (v) { btnBrake = v; });
  document.getElementById('btn-pause').addEventListener('click', function () { RM.AUDIO && RM.AUDIO.play('click'); phase === 'paused' ? resumeRace() : pauseRace(); });
  document.getElementById('btn-gear').addEventListener('click', function () { RM.AUDIO && RM.AUDIO.play('click'); RM.CFGP && RM.CFGP.toggle(); });

  window.addEventListener('keydown', function (e) {
    keys[e.code] = true;
    if (e.code === 'KeyP' || e.code === 'Escape') { phase === 'paused' ? resumeRace() : pauseRace(); }
    if (e.code === 'Space') e.preventDefault();
    RM.AUDIO && RM.AUDIO.unlock();
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && (phase === 'racing' || phase === 'stagewin' || phase === 'countdown')) pauseRace();
  });

  // ---------- 车库色块 ----------
  var SW = document.getElementById('swatches');
  var SW_COLORS = ['#e0342c', '#3f6fd9', '#e8823c', '#e8e8f0'];
  if (SW) {
    SW_COLORS.forEach(function (c, i) {
      var b = document.createElement('button');
      b.style.background = c;
      b.setAttribute('aria-label', '配色' + (i + 1));
      if (i === (cfg.player.colorway | 0)) b.classList.add('sel');
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        cfg.player.colorway = i; saveCfg();
        SW.querySelectorAll('button').forEach(function (x) { x.classList.remove('sel'); });
        b.classList.add('sel');
        RM.AUDIO && RM.AUDIO.play('click');
      });
      SW.appendChild(b);
    });
  }

  // ---------- 配置面板接线 ----------
  RM.CFGP && RM.CFGP.init({
    getConfig: function () { return cfg; },
    apply: function (snap) {
      cfg = deepMerge(clone(DEF_CFG), snap);
      saveCfg();
      applyCfg();
      showToast('设置已保存');
    }
  });
  function applyCfg() {
    RM.AUDIO && RM.AUDIO.setVolumes({ master: cfg.sound.master, bgm: cfg.sound.bgm, sfx: cfg.sound.sfx });
    var crt = document.getElementById('crt');
    crt.classList.toggle('off', !cfg.video.crt);
    document.documentElement.style.setProperty('--crt-i', String(cfg.video.crtIntensity));
    RM.FX && RM.FX.setDensity(cfg.video.particles);
    RM.FX && RM.FX.setShakeEnabled(!!cfg.video.shake);
    if (race) { race.cpTime = cfg.race.checkpointTime; race.nitroFillMul = cfg.race.nitroFill; race.cfgRubber = !!cfg.race.rubberband; }
  }

  // ---------- 测试钩子 ----------
  window.__rm = {
    version: VERSION,
    get phase() { return phase; },
    get race() { return race; },
    get cfg() { return cfg; },
    get state() { return state; },
    get busy() { return phase === 'countdown' || phase === 'racing' || phase === 'stagewin'; },
    start: function (stage) { startRace(stage || 0); },
    quit: function () { toTitle(); },
    pause: function () { pauseRace(); },
    resume: function () { resumeRace(); },
    rig: {
      time: function (s) { if (race) race.time = s; },
      left: function (s) { if (race) race.timeLeft = s; },
      nitro: function (v) { if (race) race.nitro = v; },
      speed: function (kmh) { if (race) race.speed = kmh / L.KMH; },
      pos: function (n) { if (race) { race.player.dist = (race.riders.slice().sort(function (a, b) { return b.dist - a.dist; })[n - 1] || race.player).dist + 1; L.rank(race); } },
      advance: function (segs) { if (race) race.z += (segs || 50) * L.SEG_LEN; }
    },
    errs: window.__errs || [],
    debug: function () { return { phase: phase, drag: drag.on, dragTarget: +drag.target.toFixed(2), steer: +input.steer.toFixed(2), keys: keys, btnN: btnNitro, half: halfSteer }; }
  };

  // ---------- 启动 ----------
  resize();
  RM.ART && RM.ART.init();
  RM.FX && RM.FX.init(cv);
  RM.AUDIO && RM.AUDIO.init();
  applyCfg();
  lastT = performance.now();
  rafId = requestAnimationFrame(frame);
  if (Q.stage || Q.skip) startRace((parseInt(Q.stage, 10) || 1) - 1);
  else toTitle();
})();
