/* ============================================================
 * bull-flight · src/audio.js —— 音频模块（音频代理负责）
 * 全 WebAudio 实时合成：9 个 SFX cue + 8 小节 lo-fi BGM 循环。
 * 无外部音频文件、无 fetch；唯一对外名字 window.BF.SFX。
 * 接口：init() / unlock() / play(name) / setMuted(b) / bgmOn(b)
 *       applyOverrides(map) / ready
 * ============================================================ */
(function () {
  'use strict';

  var BF = window.BF = window.BF || {};

  /* ---------------- 内部状态 ---------------- */
  var ctx = null;        // AudioContext（惰性创建，首次 init/unlock/play 建）
  var master = null;     // 总线：master -> compressor -> destination
  var sfxBus = null;     // 音效支路
  var bgmBus = null;     // BGM 支路（整体压低）
  var noiseBuf = null;   // 共享 1s 白噪声 buffer
  var muted = false;
  var ready = false;
  var bound = false;     // 手势 / 可见性监听只绑一次
  var overrides = {};    // name -> { gain, freq, ... } 合成参数缩放

  /* BGM：BPM 96、8 小节、16 分音符网格、lookahead 调度 */
  var BPM = 96, STEP = 60 / BPM / 4, TOTAL = 128;
  var AHEAD = 0.12, TICK_MS = 25, SWING = 0.10, BGM_VOL = 0.085;
  var bgmWanted = true, bgmPlaying = false, hiddenPaused = false;
  var timer = null, stepIdx = 0, nextNoteTime = 0;
  var liveArr = [];      // 存活的 BGM 声源，stop 时统一掐掉防拖音

  /* ---------------- 小工具 ---------------- */
  function mf(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function track(src, nodes, live) {
    if (live) liveArr.push(src);
    src.onended = function () {
      if (live) {
        var i = liveArr.indexOf(src);
        if (i >= 0) liveArr.splice(i, 1);
      }
      for (var j = 0; j < nodes.length; j++) {
        try { nodes[j].disconnect(); } catch (e) {}
      }
      src.onended = null;
    };
  }

  /* 振荡器音符：{t,type,f,f2,slide,dur,peak,a,lp,q,dest,live} */
  function tone(o) {
    if (!ctx) return null;
    var t0 = o.t, dest = o.dest || sfxBus;
    var osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(Math.max(1, o.f), t0);
    if (o.f2) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(1, o.f2), t0 + (o.slide != null ? o.slide : o.dur));
    }
    var g = ctx.createGain();
    var pk = Math.max(0.0002, o.peak);
    g.gain.setValueAtTime(0.0002, t0);
    g.gain.exponentialRampToValueAtTime(pk, t0 + (o.a != null ? o.a : 0.008));
    g.gain.exponentialRampToValueAtTime(0.0002, t0 + o.dur);
    var last = osc;
    if (o.lp) {
      var fl = ctx.createBiquadFilter();
      fl.type = 'lowpass'; fl.frequency.value = o.lp; fl.Q.value = o.q || 0.7;
      osc.connect(fl); last = fl;
    }
    last.connect(g); g.connect(dest);
    osc.start(t0); osc.stop(t0 + o.dur + 0.05);
    track(osc, [osc, g, last], o.live);
    return osc;
  }

  /* 噪声音符：{t,dur,peak,a,ft,f,f2,q,dest,live} */
  function noise(o) {
    if (!ctx) return null;
    var t0 = o.t, dest = o.dest || sfxBus;
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    var fl = ctx.createBiquadFilter();
    fl.type = o.ft || 'bandpass';
    fl.frequency.setValueAtTime(Math.max(10, o.f), t0);
    if (o.f2) fl.frequency.exponentialRampToValueAtTime(Math.max(10, o.f2), t0 + o.dur);
    fl.Q.value = o.q || 1;
    var g = ctx.createGain();
    var pk = Math.max(0.0002, o.peak);
    g.gain.setValueAtTime(0.0002, t0);
    g.gain.exponentialRampToValueAtTime(pk, t0 + (o.a != null ? o.a : 0.006));
    g.gain.exponentialRampToValueAtTime(0.0002, t0 + o.dur);
    src.connect(fl); fl.connect(g); g.connect(dest);
    src.start(t0, Math.random() * 0.5); src.stop(t0 + o.dur + 0.05);
    track(src, [src, fl, g], o.live);
    return src;
  }

  /* 覆盖缩放：freq 缩放频率、gain 缩放峰值（供配置面板换音色） */
  function fr(n, base) { var o = overrides[n]; return o && o.freq ? base * o.freq : base; }
  function gn(n, base) { var o = overrides[n]; return (o && o.gain != null) ? base * o.gain : base; }

  /* ---------------- 9 个 SFX cue ---------------- */
  var cues = {
    /* 点击扑翅：带通噪声快滑频的"嗖" + 极轻低频衬底 */
    tap: function (t) {
      noise({ t: t, dur: 0.11, peak: gn('tap', 0.16), a: 0.004,
        ft: 'bandpass', f: fr('tap', 480), f2: fr('tap', 2400), q: 1.1 });
      tone({ t: t, type: 'triangle', f: fr('tap', 260), f2: fr('tap', 140),
        slide: 0.09, dur: 0.09, peak: gn('tap', 0.05) });
    },
    /* 买入成交：金属叮（双正弦非谐波）+ 上行明快双音 */
    buy: function (t) {
      tone({ t: t, type: 'sine', f: fr('buy', 1568), dur: 0.32, peak: gn('buy', 0.11), a: 0.002 });
      tone({ t: t, type: 'sine', f: fr('buy', 2349), dur: 0.20, peak: gn('buy', 0.05), a: 0.002 });
      tone({ t: t + 0.07, type: 'triangle', f: fr('buy', 659), dur: 0.09, peak: gn('buy', 0.18) });
      tone({ t: t + 0.17, type: 'triangle', f: fr('buy', 880), dur: 0.15, peak: gn('buy', 0.22) });
    },
    /* 卖出平仓：收银"哒"（闷方波短音）+"叮"（亮铃双泛音） */
    sell: function (t) {
      tone({ t: t, type: 'square', f: fr('sell', 392), dur: 0.05, peak: gn('sell', 0.16), lp: 2200 });
      tone({ t: t + 0.08, type: 'sine', f: fr('sell', 1319), dur: 0.30, peak: gn('sell', 0.13), a: 0.002 });
      tone({ t: t + 0.08, type: 'sine', f: fr('sell', 1976), dur: 0.18, peak: gn('sell', 0.05), a: 0.002 });
    },
    /* 盈利落袋：上行三连音琶音 C5-E5-G5 + 高频微光噪声 */
    profit: function (t) {
      var seq = [523.25, 659.25, 783.99];
      for (var i = 0; i < 3; i++) {
        tone({ t: t + i * 0.09, type: 'triangle', f: fr('profit', seq[i]),
          dur: (i === 2 ? 0.26 : 0.11), peak: gn('profit', 0.17 + i * 0.03) });
      }
      noise({ t: t + 0.18, dur: 0.16, peak: gn('profit', 0.05), ft: 'highpass', f: fr('profit', 5600), q: 0.7 });
    },
    /* 亏损：下行两音 A4->E4 尾音微降，柔三角波不刺耳 */
    loss: function (t) {
      tone({ t: t, type: 'sine', f: fr('loss', 440), dur: 0.17, peak: gn('loss', 0.15) });
      tone({ t: t + 0.16, type: 'sine', f: fr('loss', 330), f2: fr('loss', 294),
        slide: 0.28, dur: 0.32, peak: gn('loss', 0.14), a: 0.02 });
    },
    /* 撞管道：锯齿波坠落滑频 + 低通闷响 + 次低音冲击 */
    crash: function (t) {
      tone({ t: t, type: 'sawtooth', f: fr('crash', 420), f2: fr('crash', 55),
        slide: 0.36, dur: 0.40, peak: gn('crash', 0.20), lp: fr('crash', 950), q: 0.8 });
      noise({ t: t + 0.14, dur: 0.22, peak: gn('crash', 0.34), a: 0.004,
        ft: 'lowpass', f: fr('crash', 260), f2: fr('crash', 80), q: 0.6 });
      tone({ t: t + 0.14, type: 'sine', f: fr('crash', 75), f2: fr('crash', 40),
        slide: 0.18, dur: 0.20, peak: gn('crash', 0.30) });
    },
    /* 按钮：方波短哒 + 高通噪声 tick */
    ui: function (t) {
      tone({ t: t, type: 'square', f: fr('ui', 1150), f2: fr('ui', 900),
        slide: 0.03, dur: 0.035, peak: gn('ui', 0.11), lp: fr('ui', 3200) });
      noise({ t: t, dur: 0.02, peak: gn('ui', 0.07), ft: 'highpass', f: fr('ui', 4200), q: 0.7 });
    },
    /* 开盘锣：低频基音 + 非谐波泛音簇长衰减 + 敲击噪声 */
    open: function (t) {
      var parts = [[98, 0.24, 1.8], [98.7, 0.09, 1.6], [147, 0.13, 1.4],
                   [244, 0.08, 1.05], [352, 0.05, 0.8], [523, 0.03, 0.55]];
      for (var i = 0; i < parts.length; i++) {
        tone({ t: t, type: 'sine', f: fr('open', parts[i][0]),
          dur: parts[i][2], peak: gn('open', parts[i][1]), a: 0.004 });
      }
      noise({ t: t, dur: 0.07, peak: gn('open', 0.14), ft: 'bandpass', f: fr('open', 420), q: 0.9 });
    },
    /* 暂停：短滴（正弦微降滑音） */
    pause: function (t) {
      tone({ t: t, type: 'sine', f: fr('pause', 1046), f2: fr('pause', 784),
        slide: 0.07, dur: 0.08, peak: gn('pause', 0.15) });
    }
  };

  /* ---------------- BGM：8 小节 lo-fi 循环 ----------------
   * 和弦进行 C-G-Am-F / C-G-F-G，三角波贝斯 + 低通方波旋律
   * + 柔 kick/边击 + hi-hat 噪声，轻 swing。 */
  var ROOTS = [48, 43, 45, 41, 48, 43, 41, 43];
  var CHORDS = [[48, 52, 55], [43, 47, 50], [45, 48, 52], [41, 45, 48],
                [48, 52, 55], [43, 47, 50], [41, 45, 48], [43, 47, 50]];
  var MEL = [
    [0, 76, 2], [4, 79, 2], [8, 81, 3], [12, 79, 2],
    [16, 74, 2], [20, 79, 2], [24, 74, 3], [28, 71, 2],
    [32, 72, 2], [36, 76, 2], [40, 81, 3], [44, 79, 2],
    [48, 77, 2], [52, 76, 2], [56, 74, 4],
    [64, 76, 2], [68, 79, 2], [72, 84, 3], [76, 81, 2],
    [80, 79, 2], [84, 74, 2], [88, 71, 3], [92, 74, 2],
    [96, 77, 2], [100, 81, 2], [104, 79, 3], [108, 76, 2],
    [112, 74, 3], [118, 71, 2], [122, 67, 3], [126, 72, 1]
  ];
  var MELMAP = {};
  (function () {
    for (var i = 0; i < MEL.length; i++) MELMAP[MEL[i][0]] = [MEL[i][1], MEL[i][2]];
  })();

  function bLead(f, t, dur) {
    f = f * (1 + (Math.random() * 0.004 - 0.002));
    tone({ t: t, type: 'square', f: f, dur: dur, peak: 0.17, a: 0.012,
      lp: 1700, q: 0.6, dest: bgmBus, live: true });
  }
  function bBass(f, t, dur) {
    f = f * (1 + (Math.random() * 0.003 - 0.0015));
    tone({ t: t, type: 'triangle', f: f, dur: dur, peak: 0.30, a: 0.008,
      dest: bgmBus, live: true });
  }
  function bStab(ch, t) {
    for (var i = 0; i < 3; i++) {
      tone({ t: t + i * 0.004, type: 'square', f: mf(ch[i] + 12), dur: 0.13,
        peak: 0.04, a: 0.006, lp: 1300, dest: bgmBus, live: true });
    }
  }
  function bKick(t) {
    tone({ t: t, type: 'sine', f: 150, f2: 44, slide: 0.10, dur: 0.13,
      peak: 0.5, a: 0.003, dest: bgmBus, live: true });
  }
  function bRim(t) {
    noise({ t: t, dur: 0.05, peak: 0.13, ft: 'bandpass', f: 1800, q: 1.1, dest: bgmBus, live: true });
  }
  function bHat(t, p) {
    noise({ t: t, dur: 0.03, peak: p, ft: 'highpass', f: 6800, q: 0.7, dest: bgmBus, live: true });
  }

  function scheduleStep(s, t) {
    var bar = (s >> 4) & 7, pos = s & 15;
    var ch = CHORDS[bar];
    if (pos === 0) bBass(mf(ROOTS[bar] - 12), t, 0.40);
    else if (pos === 8) bBass(mf(ROOTS[bar] - 12), t, 0.28);
    else if (pos === 12) bBass(mf(ROOTS[bar] - 5), t, 0.22);
    if (pos === 4 || pos === 12) bStab(ch, t);
    if (pos === 0 || pos === 10) bKick(t);
    if (pos === 8) bRim(t);
    if ((pos & 3) === 2) bHat(t, pos === 6 ? 0.045 : 0.03);
    var m = MELMAP[s];
    if (m) bLead(mf(m[0]), t, m[1] * STEP * 0.9);
  }

  function schedTick() {
    if (!ctx || !bgmPlaying) return;
    var horizon = ctx.currentTime + AHEAD, guard = 0;
    while (nextNoteTime < horizon && guard++ < 64) {
      var sw = (stepIdx % 2 === 1) ? SWING * STEP : 0;
      scheduleStep(stepIdx, nextNoteTime + sw);
      stepIdx = (stepIdx + 1) % TOTAL;
      nextNoteTime += STEP;
    }
  }

  function startBgm() {
    if (!ctx || bgmPlaying) return;
    bgmPlaying = true;
    var t = ctx.currentTime;
    try {
      bgmBus.gain.cancelScheduledValues(t);
      bgmBus.gain.setValueAtTime(0.0002, t);
      bgmBus.gain.exponentialRampToValueAtTime(BGM_VOL, t + 0.8);
    } catch (e) {}
    stepIdx = 0;
    nextNoteTime = t + 0.08;
    if (timer) { clearInterval(timer); timer = null; }
    timer = setInterval(schedTick, TICK_MS);
    schedTick();
  }

  function stopBgm() {
    if (timer) { clearInterval(timer); timer = null; }  // 防孤儿定时器
    bgmPlaying = false;
    if (ctx && bgmBus) {
      var t = ctx.currentTime;
      try {
        bgmBus.gain.cancelScheduledValues(t);
        bgmBus.gain.setTargetAtTime(0.0002, t, 0.04);
      } catch (e) {}
    }
    var arr = liveArr.splice(0, liveArr.length);
    for (var i = 0; i < arr.length; i++) {
      try { arr[i].stop(0); } catch (e) {}
    }
  }

  /* ---------------- 上下文 / 生命周期 ---------------- */
  function resumeCtx() {
    if (!ctx || ctx.state !== 'suspended' || !ctx.resume) return;
    var p = null;
    try { p = ctx.resume(); } catch (e) { return; }
    if (p && p.catch) p.catch(function () {});
  }

  function onVis() {
    if (!ctx) return;
    if (document.hidden) {
      if (bgmPlaying) { hiddenPaused = true; stopBgm(); }
    } else {
      resumeCtx();
      if (hiddenPaused) {
        hiddenPaused = false;
        if (bgmWanted && !bgmPlaying) startBgm();
      }
    }
  }

  function onGesture() { unlock(); }

  function bindOnce() {
    if (bound || typeof document === 'undefined') return;
    bound = true;
    var opt = { passive: true, capture: true };
    document.addEventListener('pointerdown', onGesture, opt);
    document.addEventListener('touchend', onGesture, opt);
    document.addEventListener('keydown', onGesture, opt);
    document.addEventListener('visibilitychange', onVis, false);
  }

  function ensure() {
    if (ctx) return true;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { ctx = new AC(); } catch (e) { ctx = null; return false; }
    master = ctx.createGain();
    master.gain.value = muted ? 0.0001 : 1;
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 24; comp.ratio.value = 6;
    comp.attack.value = 0.004; comp.release.value = 0.18;
    master.connect(comp); comp.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(master);
    bgmBus = ctx.createGain(); bgmBus.gain.value = 0.0001; bgmBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    var ch = noiseBuf.getChannelData(0), i;
    for (i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    ready = true;
    bindOnce();
    return true;
  }

  /* ---------------- 对外接口 ---------------- */
  function init() { ensure(); }

  function unlock() {
    if (!ensure()) return;
    resumeCtx();
    if (ctx.state === 'running') {
      if (bgmPlaying && timer && nextNoteTime < ctx.currentTime + 0.01) {
        nextNoteTime = ctx.currentTime + 0.06;  // 挂起冻结后重新对表
      }
      if (bgmWanted && !bgmPlaying && !document.hidden) startBgm();
    }
  }

  function play(name) {
    if (!ensure()) return;
    var c = cues[name];
    if (!c) return;
    if (ctx.state === 'suspended') resumeCtx();  // 无手势时静默失败，有手势即响
    try { c(ctx.currentTime + 0.02); }
    catch (e) { if (window.console && console.warn) console.warn('[BF.SFX]', name, e); }
  }

  function setMuted(b) {
    muted = !!b;
    if (ctx && master) {
      var t = ctx.currentTime;
      try {
        master.gain.cancelScheduledValues(t);
        master.gain.setTargetAtTime(muted ? 0.0001 : 1, t, 0.012);
      } catch (e) {
        try { master.gain.value = muted ? 0 : 1; } catch (e2) {}
      }
    }
  }

  function bgmOn(b) {
    bgmWanted = !!b;
    if (!ensure()) return;
    if (bgmWanted) {
      if (!bgmPlaying && !document.hidden) startBgm();
    } else {
      hiddenPaused = false;
      stopBgm();
    }
  }

  function applyOverrides(map) {
    if (!map || typeof map !== 'object') return;
    for (var name in map) {
      if (!Object.prototype.hasOwnProperty.call(map, name)) continue;
      var v = map[name];
      if (!v) { delete overrides[name]; continue; }
      var o = overrides[name] = overrides[name] || {};
      for (var k in v) {
        if (Object.prototype.hasOwnProperty.call(v, k)) o[k] = v[k];
      }
    }
  }

  BF.SFX = {
    init: init,
    unlock: unlock,
    play: play,
    setMuted: setMuted,
    bgmOn: bgmOn,
    applyOverrides: applyOverrides
  };
  Object.defineProperty(BF.SFX, 'ready', {
    get: function () { return !!ready; },
    configurable: true
  });
})();
