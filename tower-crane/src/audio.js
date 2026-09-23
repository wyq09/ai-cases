/* =========================================================================
 * tower-crane · TC.AUDIO —— 程序化音效 + BGM（零依赖，零外部音频文件）
 *
 * 总线结构：
 *   source → [filter] → gain(包络) → sfxGain / bgmGain → master → destination
 *
 * - AudioContext 惰性创建（unlock()/首次手势），iOS resume 幂等
 * - play() 在 ctx 未解锁时静默忽略，绝不抛错
 * - 循环注册表：startLoop/stopLoop，stop 干净（清调度器 + 停掉所有已排节点）
 * - visibilitychange：隐藏停 BGM、回来续（若之前在放）
 * - applyOverrides({cue: dataURL})：解码失败自动回落合成音
 * ========================================================================= */
(function () {
  'use strict';

  var TC = window.TC = window.TC || {};

  var names = ['click', 'release', 'perfect', 'great', 'good', 'miss',
               'over', 'win', 'milestone', 'combo', 'bgm'];

  /* ---- 状态 ---- */
  var ctx = null, master = null, bgmGain = null, sfxGain = null;
  var muted = false, volume = 1, bgmVolume = 0.35, sfxVolume = 0.9;
  var DUCK_FACTOR = 0.25;             // duck 时 BGM 压到的比例
  var loops = {};                     // 循环注册表 name -> true
  var bgmWanted = false;              // 用户级"BGM 应该在放"意图（hidden 期间保留）
  var activeBgm = [];                 // 已排程未结束的 BGM 源节点（stop 时全停）
  var schedTimer = null, bgmIdx = 0, bgmLoopStart = 0;
  var overrides = {};                 // name -> AudioBuffer
  var pendingOverrides = {};          // name -> dataURL（ctx 就绪前暂存）
  var flushing = false;
  var noiseBuf = null;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ================= AudioContext 生命周期 ================= */

  function ensureCtx() {
    if (ctx) return ctx;
    var AC = (typeof window !== 'undefined') &&
             (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { ctx = null; return null; }
    master = ctx.createGain();
    bgmGain = ctx.createGain();
    sfxGain = ctx.createGain();
    bgmGain.connect(master);
    sfxGain.connect(master);
    master.connect(ctx.destination);
    applyGains();
    return ctx;
  }

  function ready() { return !!(ctx && ctx.state === 'running'); }

  function tryResume() {
    if (!ctx || ctx.state === 'running') return;
    try {
      var p = ctx.resume();
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }

  function afterUnlock() {
    flushPendingOverrides();
    if (bgmWanted && ready() && !loops.bgm) startBgm();
  }

  function unlock() {
    ensureCtx();
    if (!ctx) return false;
    if (ctx.state === 'running') { afterUnlock(); return true; }
    try {
      var p = ctx.resume();
      if (p && p.then) p.then(function () { afterUnlock(); }, function () {});
      else afterUnlock();
    } catch (e) {}
    return true;
  }

  function init() { ensureCtx(); }   // 幂等：ctx 已存在时为空操作

  /* ---- 首手势自动 unlock（iOS），一次性 ---- */
  (function bindGestureUnlock() {
    if (typeof document === 'undefined' || !document.addEventListener) return;
    var evts = ['touchend', 'pointerup', 'mouseup', 'keydown'];
    var handler = function () {
      for (var i = 0; i < evts.length; i++) {
        try { document.removeEventListener(evts[i], handler); } catch (e) {}
      }
      unlock();
    };
    for (var i = 0; i < evts.length; i++) {
      try { document.addEventListener(evts[i], handler); } catch (e) {}
    }
  })();

  /* ---- visibilitychange：隐藏停 BGM、回来续 ---- */
  (function bindVisibility() {
    if (typeof document === 'undefined' || !document.addEventListener) return;
    try {
      document.addEventListener('visibilitychange', function () {
        var hidden = false;
        try { hidden = !!document.hidden; } catch (e) { return; }
        if (hidden) {
          if (loops.bgm) stopBgm();        // bgmWanted 保留，回来续
        } else {
          tryResume();
          if (bgmWanted && ready() && !loops.bgm) startBgm();
        }
      });
    } catch (e) {}
  })();

  /* ================= 增益控制 ================= */

  function setParam(param, v, t, ramp) {
    try { param.cancelScheduledValues(t); } catch (e) {}
    try {
      param.setValueAtTime(param.value, t);
      param.linearRampToValueAtTime(v, t + (ramp || 0.03));
    } catch (e) { try { param.value = v; } catch (e2) {} }
  }

  function applyGains() {
    if (!ctx) return;
    var t = ctx.currentTime;
    setParam(master.gain, muted ? 0 : volume, t);
    setParam(bgmGain.gain, bgmVolume, t);
    setParam(sfxGain.gain, sfxVolume, t);
  }

  function setMuted(m) {
    muted = !!m;
    if (ctx) setParam(master.gain, muted ? 0 : volume, ctx.currentTime);
  }
  function setVolume(v) {
    volume = clamp(Number(v) || 0, 0, 1);
    if (ctx) setParam(master.gain, muted ? 0 : volume, ctx.currentTime);
  }
  function setBGMVolume(v) {
    bgmVolume = clamp(Number(v) || 0, 0, 1);
    if (ctx) setParam(bgmGain.gain, bgmVolume, ctx.currentTime);
  }
  function setSFXVolume(v) {
    sfxVolume = clamp(Number(v) || 0, 0, 1);
    if (ctx) setParam(sfxGain.gain, sfxVolume, ctx.currentTime);
  }

  /* duck(ms)：压低 BGM（≈25%）再平滑恢复 */
  function duck(ms) {
    if (!ctx) return;
    var d = clamp(Number(ms) || 400, 50, 3000) / 1000;
    var t = ctx.currentTime;
    var g = bgmGain.gain;
    try { g.cancelScheduledValues(t); } catch (e) {}
    try {
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(bgmVolume * DUCK_FACTOR, t + 0.04);      // 快压
      g.setValueAtTime(bgmVolume * DUCK_FACTOR, t + d);
      g.linearRampToValueAtTime(bgmVolume, t + d + 0.15);                // 缓恢复
    } catch (e) {}
  }

  /* ================= 合成基元 ================= */

  function killNode(n) { try { n.disconnect(); } catch (e) {} }

  /* 振荡器 + ADSR 简化包络（指数衰减），结束时 stop+disconnect */
  function tone(o) {
    var attack = o.attack == null ? 0.004 : o.attack;
    var dur = Math.max(o.dur, attack + 0.012);
    var t = o.t;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    var f = null, tail;
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(Math.max(1, o.freq), t);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), t + dur);
    if (o.detune) { try { osc.detune.value = o.detune; } catch (e) {} }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    tail = g;
    if (o.lpf) {
      f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      try { f.frequency.value = o.lpf; } catch (e) {}
      g.connect(f); tail = f;
    }
    tail.connect(o.dest || sfxGain);
    try { osc.start(t); osc.stop(t + dur + 0.06); } catch (e) {}
    osc.onended = function () { killNode(osc); killNode(g); if (f) killNode(f); };
    return osc;
  }

  /* 白噪声 → 滤波器（可扫频）→ 包络 */
  function noise(o) {
    var attack = o.attack == null ? 0.005 : o.attack;
    var dur = Math.max(o.dur, attack + 0.012);
    var t = o.t;
    var src = ctx.createBufferSource();
    src.buffer = getNoise();
    src.loop = true;
    var f = ctx.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(Math.max(1, o.f0), t);
    if (o.f1) {
      try { f.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + dur); }
      catch (e) {}
    }
    if (o.q) { try { f.Q.value = o.q; } catch (e) {} }
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(o.dest || sfxGain);
    try { src.start(t); src.stop(t + dur + 0.05); } catch (e) {}
    src.onended = function () { killNode(src); killNode(f); killNode(g); };
    return src;
  }

  function getNoise() {
    if (!noiseBuf) {
      var len = Math.max(1, Math.floor(ctx.sampleRate * 1.0));
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  /* 钟琴/铃：基频 + 非谐泛族 */
  function bell(freq, t, dur, vol, dest) {
    dest = dest || sfxGain;
    tone({ type: 'sine', freq: freq, t: t, dur: dur, vol: vol, attack: 0.002, dest: dest });
    tone({ type: 'sine', freq: freq * 2.76, t: t, dur: dur * 0.55, vol: vol * 0.35, attack: 0.002, dest: dest });
    tone({ type: 'sine', freq: freq * 5.40, t: t, dur: dur * 0.30, vol: vol * 0.12, attack: 0.002, dest: dest });
  }

  /* ================= cue 合成（t0, vol, pitch）================= */

  var SYNTH = {
    /* 极短轻点 tick，30ms */
    click: function (t, v, p) {
      tone({ type: 'triangle', freq: 1900 * p, t: t, dur: 0.03, vol: 0.22 * v, attack: 0.001 });
      tone({ type: 'sine', freq: 3800 * p, t: t, dur: 0.02, vol: 0.08 * v, attack: 0.001 });
      noise({ t: t, dur: 0.02, vol: 0.10 * v, type: 'highpass', f0: 4200, attack: 0.001 });
    },
    /* 松钩 whoosh：带通噪声快速下扫，120ms */
    release: function (t, v, p) {
      noise({ t: t, dur: 0.12, vol: 0.50 * v, type: 'bandpass', f0: 1500 * p, f1: 280 * p, q: 1.1, attack: 0.015 });
      noise({ t: t, dur: 0.10, vol: 0.16 * v, type: 'bandpass', f0: 3600 * p, f1: 900 * p, q: 2.2, attack: 0.010 });
    },
    /* 清亮钟琴上行琶音 C6-E6-G6-C7，350ms */
    perfect: function (t, v, p) {
      var seq = [1046.5, 1318.5, 1568.0, 2093.0];
      for (var i = 0; i < seq.length; i++) {
        var tt = t + i * 0.085;
        tone({ type: 'sine', freq: seq[i] * p, t: tt, dur: 0.28, vol: 0.30 * v, attack: 0.002 });
        tone({ type: 'sine', freq: seq[i] * 3 * p, t: tt, dur: 0.10, vol: 0.05 * v, attack: 0.002 });
      }
    },
    /* 软闷响 + 短钟，200ms */
    great: function (t, v, p) {
      tone({ type: 'sine', freq: 170 * p, freqEnd: 95 * p, t: t, dur: 0.10, vol: 0.50 * v, attack: 0.003 });
      noise({ t: t, dur: 0.07, vol: 0.20 * v, type: 'lowpass', f0: 500, attack: 0.002 });
      tone({ type: 'sine', freq: 1174.7 * p, t: t + 0.05, dur: 0.15, vol: 0.12 * v, attack: 0.002 });
    },
    /* 软闷响，120ms */
    good: function (t, v, p) {
      tone({ type: 'sine', freq: 160 * p, freqEnd: 100 * p, t: t, dur: 0.12, vol: 0.45 * v, attack: 0.003 });
      noise({ t: t, dur: 0.06, vol: 0.13 * v, type: 'lowpass', f0: 420, attack: 0.002 });
    },
    /* 下落滑音 400ms + 闷碰撞，总 ~600ms */
    miss: function (t, v, p) {
      tone({ type: 'sine', freq: 640 * p, freqEnd: 120 * p, t: t, dur: 0.40, vol: 0.28 * v, attack: 0.012 });
      var ti = t + 0.38;
      tone({ type: 'sine', freq: 95 * p, freqEnd: 48 * p, t: ti, dur: 0.20, vol: 0.55 * v, attack: 0.004 });
      noise({ t: ti, dur: 0.16, vol: 0.28 * v, type: 'lowpass', f0: 300, attack: 0.003 });
    },
    /* 下行小调三音 E5→C5→A4，滑稽不刺耳（三角波），900ms */
    over: function (t, v, p) {
      var seq = [[659.26, 0], [523.25, 0.30], [440.00, 0.60]];
      for (var i = 0; i < seq.length; i++) {
        var dur = i === 2 ? 0.32 : 0.22;
        tone({ type: 'triangle', freq: seq[i][0] * p, t: t + seq[i][1], dur: dur, vol: 0.26 * v, attack: 0.012, lpf: 2200 });
        tone({ type: 'sine', freq: seq[i][0] / 2 * p, t: t + seq[i][1], dur: dur, vol: 0.10 * v, attack: 0.012 });
      }
    },
    /* 号角式上行庆祝 C-E-G-C，双锯齿失谐 + 低通，1.2s */
    win: function (t, v, p) {
      var notes = [[261.63, 0, 0.22], [329.63, 0.24, 0.22], [392.00, 0.48, 0.22], [523.25, 0.72, 0.44]];
      for (var i = 0; i < notes.length; i++) {
        var f = notes[i][0], dt = notes[i][1], dur = notes[i][2];
        tone({ type: 'sawtooth', freq: f * p, detune: -7, t: t + dt, dur: dur, vol: 0.15 * v, attack: 0.02, lpf: 1900 });
        tone({ type: 'sawtooth', freq: f * p, detune: 7, t: t + dt, dur: dur, vol: 0.15 * v, attack: 0.02, lpf: 1900 });
        tone({ type: 'triangle', freq: f * 2 * p, t: t + dt, dur: dur, vol: 0.05 * v, attack: 0.02, lpf: 3200 });
      }
    },
    /* 闪烁铃音（双 ding + 非谐泛），400ms */
    milestone: function (t, v, p) {
      bell(1568.0 * p, t, 0.28, 0.24 * v);
      bell(2093.0 * p, t + 0.13, 0.27, 0.20 * v);
    },
    /* 短 ping，pitch 参数升高音高跟着升 */
    combo: function (t, v, p) {
      tone({ type: 'sine', freq: 920 * p, t: t, dur: 0.13, vol: 0.26 * v, attack: 0.002 });
      tone({ type: 'sine', freq: 1380 * p, t: t, dur: 0.09, vol: 0.10 * v, attack: 0.002 });
    }
  };

  /* ================= BGM：五声音阶拨弦循环（合成，9.6s 短句）================= */

  var BPM = 100, BEAT = 60 / BPM, LOOP_BEATS = 16, LOOP_LEN = LOOP_BEATS * BEAT; /* 9.6s */
  var NOTE = {
    F2: 87.31, G2: 98.00, A2: 110.00, C3: 130.81, F3: 174.61, G3: 196.00,
    A3: 220.00, C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.00, A4: 440.00,
    C5: 523.25, D5: 587.33, E5: 659.26
  };

  /* 马林巴旋律（C 大调五声）+ 低音 + 尤克里里扫弦 chunk，按 beat 排序 */
  var BGM_EVENTS = (function () {
    var ev = [];
    var mel = [
      [0, 'E4', .9, .50], [1, 'G4', .45, .42], [1.5, 'A4', .45, .40], [2, 'C5', .9, .46], [3, 'G4', .5, .40],
      [4, 'A4', .9, .46], [5, 'C5', .45, .40], [5.5, 'D5', .45, .40], [6, 'E5', .9, .46], [7, 'C5', .9, .38],
      [8, 'C5', .9, .44], [9, 'D5', .45, .40], [9.5, 'C5', .45, .38], [10, 'A4', .9, .44], [11, 'G4', .5, .38],
      [12, 'G4', .9, .44], [13, 'A4', .45, .40], [13.5, 'C5', .45, .40], [14, 'D5', .9, .44], [15, 'E5', .9, .42]
    ];
    for (var i = 0; i < mel.length; i++)
      ev.push({ beat: mel[i][0], f: NOTE[mel[i][1]], dur: mel[i][2], vol: mel[i][3] });
    var bass = [[0, 'C3'], [2, 'G2'], [4, 'A2'], [6, 'E3'], [8, 'F2'], [10, 'C3'], [12, 'G2'], [14, 'G3']];
    for (i = 0; i < bass.length; i++)
      ev.push({ beat: bass[i][0], f: NOTE[bass[i][1]], dur: 0.5, vol: 0.5 });
    /* 双音 offbeat 扫弦（相隔 20ms 拨两根弦的感觉） */
    var chunks = [
      [0.5, 'C4', 'E4'], [2.5, 'C4', 'E4'], [4.5, 'A3', 'C4'], [6.5, 'A3', 'C4'],
      [8.5, 'F3', 'A3'], [10.5, 'F3', 'A3'], [12.5, 'G3', 'D4'], [14.5, 'G3', 'D4']
    ];
    for (i = 0; i < chunks.length; i++) {
      ev.push({ beat: chunks[i][0], f: NOTE[chunks[i][1]], dur: 0.4, vol: 0.18 });
      ev.push({ beat: chunks[i][0] + 0.033, f: NOTE[chunks[i][2]], dur: 0.4, vol: 0.18 });
    }
    ev.sort(function (a, b) { return a.beat - b.beat; });
    return ev;
  })();

  /* 马林巴拨弦：软基频 + 3 倍频敲击感 + 2 倍频木头感 */
  function bgmPluck(freq, t, dur, vol) {
    var d = Math.min(dur + 0.2, 0.65);
    regBgm(tone({ type: 'sine', freq: freq, t: t, dur: d, vol: vol * 0.85, attack: 0.004, dest: bgmGain }));
    regBgm(tone({ type: 'sine', freq: freq * 3.0, t: t, dur: 0.07, vol: vol * 0.16, attack: 0.002, dest: bgmGain }));
    regBgm(tone({ type: 'triangle', freq: freq * 2.0, t: t, dur: 0.05, vol: vol * 0.10, attack: 0.002, dest: bgmGain }));
  }

  function regBgm(osc) {
    activeBgm.push(osc);
    var prev = osc.onended;
    osc.onended = function () {
      var i = activeBgm.indexOf(osc);
      if (i >= 0) activeBgm.splice(i, 1);
      if (prev) prev();
    };
  }

  function bgmTick() {
    if (!ctx) return;
    var now = ctx.currentTime;
    var ahead = now + 0.65;
    var guard = 0;
    while (guard++ < 512) {
      var ev = BGM_EVENTS[bgmIdx];
      var t = bgmLoopStart + ev.beat * BEAT;
      if (t >= ahead) break;
      bgmPluck(ev.f, Math.max(t, now), ev.dur, ev.vol);
      bgmIdx++;
      if (bgmIdx >= BGM_EVENTS.length) { bgmIdx = 0; bgmLoopStart += LOOP_LEN; }
    }
  }

  function startBgm() {
    if (loops.bgm || !ready()) return false;
    var buf = overrides.bgm;
    if (buf) {
      /* 用户自定义 BGM：整段循环播放 */
      var src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      var g = ctx.createGain();
      g.gain.value = 1;
      src.connect(g); g.connect(bgmGain);
      try { src.start(0); } catch (e) {}
      activeBgm.push(src);
      src.onended = function () {
        var i = activeBgm.indexOf(src);
        if (i >= 0) activeBgm.splice(i, 1);
        killNode(src); killNode(g);
      };
      loops.bgm = true;
      return true;
    }
    bgmIdx = 0;
    bgmLoopStart = ctx.currentTime + 0.06;
    schedTimer = setInterval(bgmTick, 180);
    bgmTick();
    loops.bgm = true;
    return true;
  }

  function stopBgm() {
    if (!loops.bgm) return false;
    loops.bgm = false;
    if (schedTimer) { clearInterval(schedTimer); schedTimer = null; }
    var list = activeBgm.slice();
    activeBgm.length = 0;
    for (var i = 0; i < list.length; i++) {
      try { list[i].stop(); } catch (e) {}
      killNode(list[i]);       /* 双保险：即便 onended 不触发也断链 */
    }
    return true;
  }

  /* ================= override（自定义音效 dataURL）================= */

  function b64ToBinary(b64) {
    if (typeof atob === 'function') return atob(b64);
    if (typeof Buffer !== 'undefined' && Buffer.from) return Buffer.from(b64, 'base64').toString('binary');
    return '';
  }

  function dataURLToArrayBuffer(url) {
    try {
      var comma = url.indexOf(',');
      if (comma < 0) return null;
      var meta = url.slice(0, comma);
      var data = url.slice(comma + 1);
      var bin = /base64/i.test(meta) ? b64ToBinary(data) : decodeURIComponent(data);
      if (!bin) return null;
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 0xff;
      return bytes.buffer;
    } catch (e) { return null; }
  }

  function decodeBuffer(ab) {
    return new Promise(function (resolve, reject) {
      var p;
      try { p = ctx.decodeAudioData(ab, resolve, reject); }
      catch (e) { reject(e); return; }
      if (p && typeof p.then === 'function') p.then(resolve, reject);
    });
  }

  function decodeOverride(name, url) {
    return new Promise(function (resolve) {
      var ab;
      try { ab = dataURLToArrayBuffer(url); } catch (e) { ab = null; }
      if (!ab || !ab.byteLength) return resolve(false);
      if (!ctx) { pendingOverrides[name] = url; return resolve(false); }
      decodeBuffer(ab).then(function (buf) {
        if (!buf) return resolve(false);
        overrides[name] = buf;
        delete pendingOverrides[name];
        /* BGM 覆盖实时生效：若在循环中则重启 */
        if (name === 'bgm' && loops.bgm) { stopBgm(); startBgm(); }
        resolve(true);
      }, function () { resolve(false); });   /* 解码失败 → 回落合成音 */
    });
  }

  function flushPendingOverrides() {
    if (flushing || !ctx) return;
    flushing = true;
    var jobs = [];
    for (var k in pendingOverrides) {
      if (Object.prototype.hasOwnProperty.call(pendingOverrides, k))
        jobs.push(decodeOverride(k, pendingOverrides[k]));
    }
    Promise.all(jobs).then(function () { flushing = false; }, function () { flushing = false; });
  }

  function applyOverrides(map) {
    var out = {};
    if (!map) return Promise.resolve(out);
    var jobs = [];
    for (var k in map) {
      if (!Object.prototype.hasOwnProperty.call(map, k)) continue;
      if (names.indexOf(k) === -1) continue;          /* 未知 cue 忽略 */
      var url = map[k];
      if (!url || typeof url !== 'string') { out[k] = false; continue; }
      jobs.push(decodeOverride(k, url).then(function (k2) {
        return function (ok) { out[k2] = ok; };
      }(k)));
    }
    return Promise.all(jobs).then(function () { return out; });
  }

  /* ================= 播放入口 ================= */

  function playBufferOneShot(buf, vol, pitch) {
    var src = ctx.createBufferSource();
    src.buffer = buf;
    try { src.playbackRate.value = clamp(pitch || 1, 0.25, 4); } catch (e) {}
    var g = ctx.createGain();
    try { g.gain.value = clamp(vol == null ? 1 : vol, 0, 2); } catch (e) {}
    src.connect(g); g.connect(sfxGain);
    try { src.start(ctx.currentTime); src.stop(ctx.currentTime + (buf.duration || 0) + 0.1); } catch (e) {}
    src.onended = function () { killNode(src); killNode(g); };
  }

  function play(name, opts) {
    try {
      if (!name || names.indexOf(name) === -1) return false;
      if (muted) return false;
      if (name === 'bgm') return startLoop('bgm');
      if (!ready()) return false;                    /* 未解锁静默忽略 */
      var o = opts || {};
      var v = clamp(o.vol == null ? 1 : o.vol, 0, 2);
      var p = clamp(o.pitch == null ? 1 : o.pitch, 0.1, 4);
      var buf = overrides[name];
      if (buf) { playBufferOneShot(buf, v, p); return true; }
      var fn = SYNTH[name];
      if (!fn) return false;
      fn(ctx.currentTime, v, p);
      return true;
    } catch (e) { return false; }                    /* 任何异常不出声即止 */
  }

  function startLoop(name) {
    try {
      if (name !== 'bgm') return false;
      bgmWanted = true;
      if (loops.bgm) return true;                    /* 幂等 */
      return startBgm();
    } catch (e) { return false; }
  }

  function stopLoop(name) {
    try {
      if (name !== 'bgm') return false;
      bgmWanted = false;
      return stopBgm();
    } catch (e) { return false; }
  }

  /* ================= 导出 ================= */

  TC.AUDIO = {
    names: names,
    init: init,
    unlock: unlock,
    play: play,
    startLoop: startLoop,
    stopLoop: stopLoop,
    duck: duck,
    setMuted: setMuted,
    setVolume: setVolume,
    setBGMVolume: setBGMVolume,
    setSFXVolume: setSFXVolume,
    applyOverrides: applyOverrides,
    isLooping: function (name) { return !!loops[name]; },
    isReady: ready
  };

})();
