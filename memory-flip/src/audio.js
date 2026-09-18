/* ============================================================
 * memory-flip · MF.AUDIO — WebAudio 程序化音效（零依赖 / 零外部音频）
 * 总线: sfx/bgm -> master -> compressor -> destination（防爆音）
 * 配方: 拨弦=三角波+低通扫频短衰减 | 叮=正弦+2倍频泛音(+3倍频微光)
 *       木鱼=带通噪声脉冲 | fanfare=方波低通柔化+微上滑音 | 沙=带通/高通噪声
 * 引擎: AudioContext 惰性创建；unlock 幂等；循环 lookahead 调度，
 *       stopLoop 清定时器+全部源 stop；visibilitychange 停/续 BGM；
 *       duck(ms) 压 BGM 后恢复；applyOverrides(dataURL) 优先、失败回落合成。
 * ============================================================ */
window.MF = window.MF || {};
MF.AUDIO = (function () {
  'use strict';

  var names = ['flip', 'match', 'miss', 'combo', 'win', 'lose', 'tick', 'click', 'bgm'];

  /* ----- 状态 ----- */
  var ctx = null, master = null, sfx = null, bgm = null, noiseBuf = null;
  var vBGM = 0.4, vSFX = 0.9, vMaster = 1;   // BGM 默认自压低 0.4
  var unlocked = false, duckTimer = 0, visBound = false;
  var loops = {};      // name -> {running,timer,pending[],step,nextTime,bufferSrc}
  var wanted = {};     // 用户意图（页面隐藏 halt，可见恢复）
  var overrides = {};  // name -> AudioBuffer（自定义音效优先）
  var pendingOv = {};  // name -> dataURL（待解码）
  var decBusy = {};
  var curPending = null; // 正在调度的循环的「待停源」列表

  /* ----- BGM 素材：C 宫五声音阶（C D E G A），92bpm 八分音符 ----- */
  var STEP = 60 / 92 / 2;                  // ≈0.326s
  var NOTE = { C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.00, A4: 440.00, C5: 523.25, D5: 587.33, E5: 659.26 };
  var MEL = ['C4', 'E4', 'G4', 'A4', 'C5', 0, 'A4', 'G4',
             'E4', 0, 'G4', 'A4', 'D5', 0, 'C5', 'A4',
             'C4', 'E4', 'G4', 'A4', 'C5', 0, 'D5', 'E5',
             'G4', 0, 'E5', 'D5', 'C5', 'A4', 'G4', 0];   // 32 步 = 4 小节
  var WOOD = { 2: 1, 6: 1, 18: 1, 22: 1, 29: 1 };         // 木鱼点缀
  var COMBO_F = [440, 523.25, 659.25, 880];               // A4 C5 E5 A5

  function clamp01(v) { v = +v; if (v !== v) v = 1; return v < 0 ? 0 : (v > 1 ? 1 : v); }

  /* ---------- 基础件：源用完 stop()+disconnect()，循环源登记待停 ---------- */
  function bye(src, aux, pend) {
    src.onended = function () {
      try { src.disconnect(); } catch (e) {}
      if (aux) for (var i = 0; i < aux.length; i++) { try { aux[i].disconnect(); } catch (e2) {} }
      if (pend) { var k = pend.indexOf(src); if (k >= 0) pend.splice(k, 1); }
    };
  }
  function env(dest, t0, peak, atk, dec) {
    var g = ctx.createGain(), p = g.gain;
    p.setValueAtTime(0.0001, t0);
    try {
      p.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + atk);
      p.exponentialRampToValueAtTime(0.0001, t0 + atk + dec);
    } catch (e) { try { p.value = peak; } catch (e2) {} }
    g.connect(dest);
    return g;
  }
  function oscAt(type, f, t0, dur, dest, aux) {
    var o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    o.connect(dest);
    o.start(t0);
    o.stop(t0 + dur);
    if (curPending) curPending.push(o);
    bye(o, aux, curPending);
    return o;
  }
  function noiseHit(t0, dur, ftype, freq, Q, peak, atk, dec, dest) {
    if (!noiseBuf) return null;
    var s = ctx.createBufferSource();
    s.buffer = noiseBuf; s.loop = true;
    var f = ctx.createBiquadFilter();
    f.type = ftype; f.frequency.value = freq; f.Q.value = Q;
    var g = env(dest, t0, peak, atk, dec);
    s.connect(f); f.connect(g);
    try { s.start(t0, Math.random() * 0.4); } catch (e) { try { s.start(t0); } catch (e2) {} }
    s.stop(t0 + dur);
    if (curPending) curPending.push(s);
    bye(s, [f, g], curPending);
    return s;
  }
  /* 叮：正弦基音 + 2 倍频泛音（shimmer 时加 3 倍频微光） */
  function ding(t0, f, dur, peak, dest, shimmer) {
    oscAt('sine', f, t0, dur + 0.02, env(dest, t0, peak, 0.006, dur));
    oscAt('sine', f * 2, t0, dur * 0.6 + 0.02, env(dest, t0, peak * 0.32, 0.004, dur * 0.6));
    if (shimmer) oscAt('sine', f * 3, t0, dur * 0.35 + 0.02, env(dest, t0, peak * 0.10, 0.003, dur * 0.35));
  }
  /* 拨弦：三角波 + 低通 2400→750 扫频，~0.3s 短衰减 */
  function pluck(t0, f, vol, dest) {
    var fl = ctx.createBiquadFilter();
    fl.type = 'lowpass'; fl.Q.value = 1;
    fl.frequency.setValueAtTime(2400, t0);
    fl.frequency.exponentialRampToValueAtTime(750, t0 + 0.26);
    var g = env(fl, t0, vol, 0.004, 0.30);
    fl.connect(dest);
    oscAt('triangle', f, t0, 0.33, g, [fl, g]);
    oscAt('sine', f * 2, t0, 0.14, env(dest, t0, vol * 0.25, 0.003, 0.12));
  }
  function wood(t0, dest, vol) { noiseHit(t0, 0.06, 'bandpass', 1050, 8, vol, 0.002, 0.05, dest); }
  function shaker(t0, dest, vol) { noiseHit(t0, 0.05, 'highpass', 6000, 0.7, vol, 0.004, 0.04, dest); }

  /* ---------- cue 合成 ---------- */
  function sFlip(t0, out) {   // 轻快翻页「沙嗒」~90ms
    noiseHit(t0, 0.085, 'bandpass', 2600, 0.9, 0.45, 0.004, 0.07, out);
    oscAt('square', 2100, t0, 0.03, env(out, t0, 0.10, 0.002, 0.025));
  }
  function sMatch(t0, out) {  // 上行双音叮咚 E5→A5 ~350ms
    ding(t0, 659.25, 0.18, 0.30, out, true);
    ding(t0 + 0.13, 880, 0.22, 0.34, out, true);
  }
  function sMiss(t0, out) {   // 低音「咚」~180ms，频率下坠
    var g = env(out, t0, 0.5, 0.005, 0.16);
    var o = oscAt('sine', 150, t0, 0.18, g);
    o.frequency.setValueAtTime(190, t0);
    o.frequency.exponentialRampToValueAtTime(140, t0 + 0.06);
    oscAt('triangle', 95, t0, 0.13, env(out, t0, 0.25, 0.004, 0.10));
  }
  function sCombo(t0, out, o) { // 连击叮 A4/C5/E5/A5 ~250ms
    var lv = o && o.level ? (o.level | 0) : 1;
    if (lv < 1 || lv > 4) lv = 1;
    ding(t0, COMBO_F[lv - 1], 0.2, 0.34, out, true);
    oscAt('square', COMBO_F[lv - 1] * 2, t0, 0.05, env(out, t0, 0.05, 0.002, 0.04));
  }
  /* fanfare 单音：方波 + 低通柔化 + 微上滑（不过分刺耳） */
  function fanNote(t0, f, dur, peak, out) {
    var fl = ctx.createBiquadFilter();
    fl.type = 'lowpass'; fl.frequency.value = 2200; fl.Q.value = 0.5;
    var g = env(fl, t0, peak, 0.012, dur);
    fl.connect(out);
    var o = oscAt('square', f, t0, dur + 0.03, g, [fl, g]);
    o.frequency.setValueAtTime(f * 0.97, t0);
    o.frequency.exponentialRampToValueAtTime(f, t0 + 0.06);
  }
  function sWin(t0, out) {    // 三连上行 + 收尾琶音 ~900ms
    var tri = [523.25, 659.25, 783.99], i;
    for (i = 0; i < 3; i++) fanNote(t0 + i * 0.14, tri[i], 0.17, 0.15, out);
    var arp = [523.25, 659.25, 783.99, 1046.50];
    for (i = 0; i < arp.length; i++) {
      var last = i === 3;
      ding(t0 + 0.48 + i * 0.07, arp[i], last ? 0.3 : 0.14, last ? 0.3 : 0.2, out, last);
    }
  }
  function sLose(t0, out) {   // 下行两音 ~500ms，带下坠弯音
    var seq = [[329.63, 0, 0.22], [261.63, 0.24, 0.30]];
    for (var i = 0; i < 2; i++) {
      var f = seq[i][0], t = t0 + seq[i][1];
      var fl = ctx.createBiquadFilter();
      fl.type = 'lowpass'; fl.frequency.value = 1100; fl.Q.value = 0.5;
      var g = env(fl, t, 0.28, 0.01, seq[i][2]);
      fl.connect(out);
      var o = oscAt('triangle', f, t, seq[i][2] + 0.03, g, [fl, g]);
      o.frequency.setValueAtTime(f * 1.05, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.92, t + seq[i][2]);
    }
  }
  function sTick(t0, out) {   // 木鱼短嗒 ~60ms = 带通噪声脉冲 + 定音
    noiseHit(t0, 0.055, 'bandpass', 1150, 9, 0.5, 0.002, 0.045, out);
    oscAt('sine', 840, t0, 0.05, env(out, t0, 0.2, 0.002, 0.035));
  }
  function sClick(t0, out) {  // UI 轻嗒 ~40ms
    noiseHit(t0, 0.035, 'highpass', 4200, 0.7, 0.22, 0.001, 0.03, out);
    oscAt('triangle', 1900, t0, 0.025, env(out, t0, 0.08, 0.001, 0.02));
  }
  function stepNote(i, t, out) {  // BGM 一步：拨弦旋律 + 木鱼/沙锤点缀
    i = i % 32;
    var m = MEL[i];
    if (m) pluck(t, NOTE[m], 0.13 + Math.random() * 0.04, out);
    if (WOOD[i]) wood(t, out, 0.09);
    if (i % 4 === 3) shaker(t, out, (i % 8 === 3) ? 0.05 : 0.035);
  }
  function sBGM(t0, out) {    // play('bgm')：预览一小节
    for (var i = 0; i < 8; i++) stepNote(i, t0 + i * STEP, out);
  }
  var SYNTH = { flip: sFlip, match: sMatch, miss: sMiss, combo: sCombo, win: sWin, lose: sLose, tick: sTick, click: sClick, bgm: sBGM };

  /* ---------- 上下文（惰性）与总线 ---------- */
  function makeNoise() {
    try {
      var b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = b.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return b;
    } catch (e) { return null; }
  }
  function resumeCtx() {
    if (ctx && ctx.state === 'suspended' && ctx.resume) {
      try { var p = ctx.resume(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
    }
  }
  function ensureCtx() {
    if (ctx) { resumeCtx(); return ctx; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { ctx = null; }
    if (!ctx) return null;
    master = ctx.createGain(); master.gain.value = vMaster;
    sfx = ctx.createGain(); sfx.gain.value = vSFX;
    bgm = ctx.createGain(); bgm.gain.value = vBGM;
    var comp = ctx.createDynamicsCompressor ? ctx.createDynamicsCompressor() : null;
    sfx.connect(master); bgm.connect(master);
    if (comp) { master.connect(comp); comp.connect(ctx.destination); }
    else master.connect(ctx.destination);
    noiseBuf = makeNoise();
    bindVisibility();
    flushOverrides();
    resumeCtx();
    return ctx;
  }
  function unlock() {  // 幂等：首次手势 resume + 静音缓冲解锁
    var c = ensureCtx();
    if (!c) return;
    if (!unlocked) {
      unlocked = true;
      try {
        var n = Math.max(1, (c.sampleRate * 0.1) | 0);
        var b = c.createBuffer(1, n, c.sampleRate);
        var s = c.createBufferSource();
        s.buffer = b; s.connect(c.destination);
        s.start(c.currentTime); s.stop(c.currentTime + 0.05);
        bye(s);
      } catch (e) {}
    }
  }

  /* ---------- visibilitychange：hidden 停 BGM，可见恢复（若原本在播） ---------- */
  function bindVisibility() {
    if (visBound) return;
    visBound = true;
    if (typeof document === 'undefined' || !document.addEventListener) return;
    document.addEventListener('visibilitychange', function () {
      var hidden = false;
      try { hidden = !!document.hidden; } catch (e) {}
      if (hidden) {
        for (var n in loops) { if (loops[n] && loops[n].running) halt(n); }
      } else {
        for (var n2 in wanted) { if (wanted[n2]) startLoop(n2); }
      }
    });
  }

  /* ---------- 循环（lookahead 调度 + 注册表停干净） ---------- */
  function schedBGM(name) {
    var e = loops[name];
    if (!e || !e.running || !ctx) return;
    curPending = e.pending;
    try {
      var ahead = ctx.currentTime + 0.2, guard = 0;
      while (e.nextTime < ahead && guard++ < 64) {
        stepNote(e.step, e.nextTime, bgm);
        e.step++;
        e.nextTime += STEP;
      }
    } catch (err) {}
    curPending = null;
  }
  function halt(name) {
    var e = loops[name];
    if (!e) return false;
    e.running = false;
    if (e.timer) { clearInterval(e.timer); e.timer = 0; }
    if (e.bufferSrc) {
      try { e.bufferSrc.stop(0); } catch (er) {}
      try { e.bufferSrc.disconnect(); } catch (er2) {}
      e.bufferSrc = null;
    }
    var p = e.pending;
    while (p.length) {
      var s = p.pop();
      try { if (s.stop) s.stop(0); } catch (er3) {}
      try { s.disconnect(); } catch (er4) {}
    }
    return true;
  }
  function startLoop(name) {
    if (!name || names.indexOf(name) < 0) return false;
    if (loops[name] && loops[name].running) return true;
    var c = ensureCtx();
    if (!c) return false;
    var buf = overrides[name];
    if (name !== 'bgm' && !buf) return false;
    wanted[name] = true;
    var e = loops[name] = { running: true, timer: 0, pending: [], step: 0, nextTime: c.currentTime + 0.08, bufferSrc: null };
    if (buf) {  // 自定义 BGM：BufferSource loop
      try {
        var s = c.createBufferSource();
        s.buffer = buf; s.loop = true;
        s.connect(bgm);
        s.start(c.currentTime + 0.03);
        bye(s);
        e.bufferSrc = s;
      } catch (err) {}
      return true;
    }
    e.timer = setInterval(function () { schedBGM(name); }, 60);
    schedBGM(name);
    return true;
  }
  function stopLoop(name) {
    if (!name || names.indexOf(name) < 0) return false;
    wanted[name] = false;
    return halt(name);
  }

  /* ---------- duck：压 BGM 后恢复 ---------- */
  function smoothTo(p, target, t, tc) {
    try { p.cancelScheduledValues(t); } catch (e) {}
    try { p.setValueAtTime(p.value, t); p.setTargetAtTime(target, t, tc); }
    catch (e2) { try { p.value = target; } catch (e3) {} }
  }
  function duck(ms) {
    if (!ctx || !bgm) return;
    smoothTo(bgm.gain, vBGM * 0.25, ctx.currentTime, 0.05);
    if (duckTimer) { clearTimeout(duckTimer); duckTimer = 0; }
    duckTimer = setTimeout(function () {
      duckTimer = 0;
      if (!ctx || !bgm) return;
      smoothTo(bgm.gain, vBGM, ctx.currentTime, 0.15);
    }, Math.max(1, ms | 0));
  }

  /* ---------- 音量 ---------- */
  function setBGMVolume(v) { vBGM = clamp01(v); if (ctx && bgm) smoothTo(bgm.gain, vBGM, ctx.currentTime, 0.03); }
  function setSFXVolume(v) { vSFX = clamp01(v); if (ctx && sfx) smoothTo(sfx.gain, vSFX, ctx.currentTime, 0.03); }
  function setMasterVolume(v) { vMaster = clamp01(v); if (ctx && master) smoothTo(master.gain, vMaster, ctx.currentTime, 0.03); }

  /* ---------- 自定义音效覆盖（dataURL 解码优先，失败回落合成） ---------- */
  function b64ToAB(b64) {
    try {
      var bin = atob(b64), n = bin.length, ab = new Uint8Array(n);
      for (var i = 0; i < n; i++) ab[i] = bin.charCodeAt(i);
      return ab.buffer;
    } catch (e) { return null; }
  }
  function urlToAB(url) {
    if (typeof url !== 'string') return null;
    var i = url.indexOf(',');
    if (i < 0) return null;
    var meta = url.slice(0, i), data = url.slice(i + 1);
    if (/;base64/i.test(meta)) return b64ToAB(data.replace(/\s/g, ''));
    try {
      var raw = decodeURIComponent(data), n = raw.length, ab = new Uint8Array(n);
      for (var j = 0; j < n; j++) ab[j] = raw.charCodeAt(j) & 255;
      return ab.buffer;
    } catch (e) { return null; }
  }
  function decodeOne(name) {
    if (!ctx) return;
    var url = pendingOv[name];
    if (!url || decBusy[name]) return;
    var ab = urlToAB(url);
    if (!ab) { if (pendingOv[name] === url) delete pendingOv[name]; return; }
    decBusy[name] = true;
    var done = false;
    var settle = function (b) {
      if (done) return;
      done = true; decBusy[name] = false;
      if (b) overrides[name] = b;
      if (pendingOv[name] === url) delete pendingOv[name];
      if (pendingOv[name]) decodeOne(name);
    };
    try {
      var r = ctx.decodeAudioData(ab, settle, function () { settle(null); });
      if (r && r.then) r.then(settle, function () { settle(null); });
    } catch (e) { done = true; decBusy[name] = false; if (pendingOv[name] === url) delete pendingOv[name]; }
  }
  function flushOverrides() { for (var n in pendingOv) decodeOne(n); }
  function applyOverrides(map) {
    if (!map || typeof map !== 'object') return;
    for (var k in map) {
      if (names.indexOf(k) < 0) continue;
      var v = map[k];
      if (!v || typeof v !== 'string') { delete overrides[k]; delete pendingOv[k]; continue; }
      pendingOv[k] = v;
      delete overrides[k];
      decodeOne(k);
    }
  }

  /* ---------- play：未知 name 安全返回 false ---------- */
  function play(name, opts) {
    if (!name || names.indexOf(name) < 0) return false;
    var c = ensureCtx();
    if (!c) return false;
    var buf = overrides[name];
    if (buf) {
      try {
        var s = c.createBufferSource();
        s.buffer = buf;
        s.connect(name === 'bgm' ? bgm : sfx);
        s.start(c.currentTime + 0.02);
        bye(s);
        return true;
      } catch (e) {}
    }
    var fn = SYNTH[name];
    if (!fn) return false;
    try { fn(c.currentTime + 0.02, name === 'bgm' ? bgm : sfx, opts || {}); return true; }
    catch (e2) { return false; }
  }

  return {
    unlock: unlock,
    play: play,
    startLoop: startLoop,
    stopLoop: stopLoop,
    duck: duck,
    setBGMVolume: setBGMVolume,
    setSFXVolume: setSFXVolume,
    setMasterVolume: setMasterVolume,
    applyOverrides: applyOverrides,
    names: names
  };
})();
