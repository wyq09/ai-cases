/* ============================================================
 * 泡泡堂 · src/audio.js —— BA.AUDIO 全 WebAudio 程序化合成
 * 零外部资源。轻快街机音色：泡泡噗、水柱哗、吃道具叮、胜利号角。
 *
 * 链路: sfxBus(用户音量) -> master(静音) -> compressor -> destination
 *       musicBus(用户音量) -> master
 * ============================================================ */
(function (global) {
  'use strict';
  var BA = (global.BA = global.BA || {});

  var ctx = null, master = null, sfxBus = null, musicBus = null, comp = null;
  var noiseBuf = null;
  var muted = false, sfxVol = 0.8, musicVol = 0.32;
  var live = [];
  var lastT = {};
  var bgmTimer = null, bgmOn = false, bgmStep = 0, bgmNext = 0;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function now() { return ctx ? ctx.currentTime : 0; }

  function ensure() {
    if (ctx) return ctx;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 1;
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 12;
      comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.18;
      sfxBus = ctx.createGain(); sfxBus.gain.value = sfxVol;
      musicBus = ctx.createGain(); musicBus.gain.value = musicVol;
      sfxBus.connect(master); musicBus.connect(master);
      master.connect(comp); comp.connect(ctx.destination);
      // 1s 白噪声
      var n = ctx.sampleRate;
      noiseBuf = ctx.createBuffer(1, n, n);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ctx = null; }
    return ctx;
  }

  function cleanup(src, nodes) {
    if (src) {
      try { src.onended = null; } catch (e) {}
      try { src.stop(0); } catch (e) {}
    }
    for (var i = 0; i < nodes.length; i++) {
      try { if (nodes[i]) nodes[i].disconnect(); } catch (e) {}
    }
  }
  function reg(src, nodes) {
    live.push(src);
    src.onended = function () {
      var i = live.indexOf(src);
      if (i >= 0) live.splice(i, 1);
      for (var j = 0; j < nodes.length; j++) { try { nodes[j].disconnect(); } catch (e) {} }
      src.onended = null;
    };
  }
  function route(dest) {
    return dest === 'music' ? musicBus : sfxBus;
  }

  /* 单音 */
  function tone(opt) {
    if (!ensure() || muted) return;
    var t0 = now() + (opt.delay || 0);
    var dur = opt.dur || 0.12;
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = opt.type || 'sine';
    o.frequency.setValueAtTime(opt.f0, t0);
    if (opt.f1 != null) o.frequency.exponentialRampToValueAtTime(Math.max(1, opt.f1), t0 + dur);
    var peak = (opt.vol == null ? 0.25 : opt.vol);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (opt.atk || 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(route(opt.dest));
    o.start(t0); o.stop(t0 + dur + 0.03);
    reg(o, [g]);
  }
  /* 噪声 */
  function noise(opt) {
    if (!ensure() || muted) return;
    var t0 = now() + (opt.delay || 0);
    var dur = opt.dur || 0.2;
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    var f = ctx.createBiquadFilter();
    f.type = opt.filter || 'bandpass';
    f.frequency.setValueAtTime(opt.f0 || 1200, t0);
    if (opt.f1 != null) f.frequency.exponentialRampToValueAtTime(Math.max(20, opt.f1), t0 + dur);
    f.Q.value = opt.q == null ? 1 : opt.q;
    var g = ctx.createGain();
    var peak = (opt.vol == null ? 0.2 : opt.vol);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (opt.atk || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(route(opt.dest));
    src.start(t0); src.stop(t0 + dur + 0.03);
    reg(src, [f, g]);
  }

  /* ---------------- 音色表 ---------------- */
  var CUES = {
    click: function () { tone({ type: 'square', f0: 900, f1: 620, dur: 0.05, vol: 0.1 }); },
    hover: function () { tone({ type: 'sine', f0: 1200, dur: 0.03, vol: 0.045 }); },
    place: function () {
      tone({ type: 'sine', f0: 520, f1: 260, dur: 0.12, vol: 0.22 });
      noise({ f0: 2200, f1: 700, dur: 0.09, vol: 0.1, q: 1.4 });
    },
    pop: function (o) {
      var p = (o && o.pitch) || 1;
      tone({ type: 'sine', f0: 300 * p, f1: 90 * p, dur: 0.22, vol: 0.3 });
      noise({ f0: 900 * p, f1: 160, dur: 0.3, vol: 0.24, q: 0.8 });
      tone({ type: 'triangle', f0: 120 * p, f1: 60, dur: 0.26, vol: 0.14, delay: 0.01 });
    },
    splash: function (o) {
      var p = (o && o.pitch) || 1;
      noise({ f0: 2400 * p, f1: 700, dur: 0.26, vol: 0.16, q: 0.7 });
      tone({ type: 'sine', f0: 720 * p, f1: 1500 * p, dur: 0.16, vol: 0.09 });
    },
    chain: function (o) {
      var p = (o && o.pitch) || 1;
      tone({ type: 'sawtooth', f0: 160 * p, f1: 80, dur: 0.16, vol: 0.16 });
    },
    box: function () {
      noise({ f0: 1500, f1: 300, dur: 0.24, vol: 0.18, q: 0.6, filter: 'lowpass' });
      tone({ type: 'square', f0: 180, f1: 90, dur: 0.12, vol: 0.09 });
    },
    item: function () {
      [880, 1174, 1568].forEach(function (f, i) {
        tone({ type: 'triangle', f0: f, dur: 0.13, vol: 0.16, delay: i * 0.045 });
      });
    },
    trap: function () {
      tone({ type: 'sine', f0: 640, f1: 320, dur: 0.4, vol: 0.16 });
      noise({ f0: 700, f1: 1800, dur: 0.3, vol: 0.1, q: 2 });
    },
    rescue: function () {
      [523, 659, 784, 1046].forEach(function (f, i) {
        tone({ type: 'sine', f0: f, dur: 0.18, vol: 0.16, delay: i * 0.055 });
      });
    },
    death: function () {
      tone({ type: 'sawtooth', f0: 420, f1: 70, dur: 0.7, vol: 0.18 });
      noise({ f0: 800, f1: 100, dur: 0.6, vol: 0.14, q: 0.5 });
    },
    count: function (o) {
      var n = (o && o.n) || 0;
      tone({ type: 'square', f0: n === 0 ? 1046 : 660, dur: n === 0 ? 0.34 : 0.14, vol: 0.15 });
    },
    win: function () {
      var seq = [[523, 0], [659, .1], [784, .2], [1046, .3], [1318, .42], [1568, .54]];
      seq.forEach(function (s) {
        tone({ type: 'triangle', f0: s[0], dur: 0.26, vol: 0.2, delay: s[1] });
      });
      tone({ type: 'sine', f0: 261, dur: 0.9, vol: 0.12, delay: 0.1 });
    },
    lose: function () {
      var seq = [[440, 0], [392, .16], [330, .32], [262, .5]];
      seq.forEach(function (s) {
        tone({ type: 'triangle', f0: s[0], dur: 0.3, vol: 0.16, delay: s[1] });
      });
    },
    kick: function () {
      tone({ type: 'square', f0: 220, f1: 440, dur: 0.09, vol: 0.14 });
      noise({ f0: 1800, f1: 900, dur: 0.07, vol: 0.08 });
    },
    bump: function () {
      tone({ type: 'sine', f0: 150, f1: 110, dur: 0.07, vol: 0.1 });
    },
    shield: function () {
      tone({ type: 'sine', f0: 400, f1: 1200, dur: 0.3, vol: 0.16 });
      tone({ type: 'triangle', f0: 600, f1: 1800, dur: 0.3, vol: 0.1, delay: 0.03 });
    },
    sudden: function () {
      tone({ type: 'sawtooth', f0: 110, f1: 55, dur: 0.8, vol: 0.14 });
      noise({ f0: 300, f1: 1200, dur: 0.7, vol: 0.1, q: 0.8 });
    },
    tick: function () { tone({ type: 'sine', f0: 1400, dur: 0.025, vol: 0.04 }); }
  };

  /* ---------------- BGM：轻快 8bit 循环 ---------------- */
  // 简单和弦进行 + 琶音，小音量垫底
  var BGM_BPM = 112;
  var BGM_CHORDS = [
    [0, 4, 7], [5, 9, 12], [7, 11, 14], [3, 7, 10],
    [0, 4, 7], [5, 9, 12], [10, 14, 17], [7, 11, 14]
  ];
  var ROOT = 261.63; // C4
  function semi(n) { return ROOT * Math.pow(2, n / 12); }

  function scheduleBgm() {
    if (!ctx || !bgmOn || muted) return;
    var spb = 60 / BGM_BPM;
    var look = 0.5;
    while (bgmNext < now() + look) {
      var step = bgmStep % 32;
      var bar = Math.floor(step / 4) % 8;
      var chord = BGM_CHORDS[bar];
      var inBar = step % 4;
      // 低音
      if (inBar === 0) {
        tone({ type: 'triangle', f0: semi(chord[0] - 12), dur: spb * 0.9, vol: 0.13, dest: 'music' });
      }
      // 琶音
      var note = chord[inBar % 3] + (inBar === 3 ? 12 : 0);
      tone({ type: 'square', f0: semi(note + 12), dur: spb * 0.42, vol: 0.035, dest: 'music' });
      // 轻打点
      if (inBar === 0 || inBar === 2) {
        noise({ f0: 5200, dur: 0.03, vol: 0.022, q: 3, dest: 'music' });
      }
      bgmStep++;
      bgmNext += spb / 2;
    }
  }

  function startBgm() {
    if (!ensure()) return;
    bgmOn = true;
    bgmNext = now() + 0.08;
    if (!bgmTimer) bgmTimer = setInterval(scheduleBgm, 120);
    scheduleBgm();
  }
  function stopBgm() {
    bgmOn = false;
    if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
  }

  var docBound = false;
  function bindDoc() {
    if (docBound || typeof document === 'undefined') return;
    docBound = true;
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        stopBgm();
      } else if (!document.hidden && BA.AUDIO._wantBgm) {
        startBgm();
      }
    });
  }

  function unlock() {
    var c = ensure();
    if (!c) return;
    try { if (c.state === 'suspended') c.resume(); } catch (e) {}
    bindDoc();
  }

  BA.AUDIO = {
    init: function (cfg) {
      if (cfg) { sfxVol = cfg.sfxVolume == null ? sfxVol : cfg.sfxVolume; musicVol = cfg.musicVolume == null ? musicVol : cfg.musicVolume; }
      ensure();
      if (sfxBus) sfxBus.gain.value = sfxVol;
      if (musicBus) musicBus.gain.value = musicVol;
      bindDoc();
    },
    unlock: unlock,
    play: function (name, opts) {
      if (muted) return;
      var fn = CUES[name] || CUES.click;
      var t = now();
      if (lastT[name] && t - lastT[name] < 0.035) return;
      lastT[name] = t;
      try { fn(opts); } catch (e) {}
    },
    names: Object.keys(CUES),
    bgm: function (on) {
      BA.AUDIO._wantBgm = !!on;
      if (on) { unlock(); startBgm(); }
      else stopBgm();
    },
    duck: function (ms) {
      if (!ensure()) return;
      var t = now(), d = (ms || 600) / 1000;
      try {
        musicBus.gain.cancelScheduledValues(t);
        musicBus.gain.setValueAtTime(musicBus.gain.value, t);
        musicBus.gain.linearRampToValueAtTime(musicVol * 0.28, t + 0.05);
        musicBus.gain.linearRampToValueAtTime(musicVol, t + d);
      } catch (e) {}
    },
    setSfx: function (v) { sfxVol = clamp(v, 0, 1); if (sfxBus) sfxBus.gain.value = sfxVol; },
    setMusic: function (v) { musicVol = clamp(v, 0, 1); if (musicBus) musicBus.gain.value = musicVol; },
    muted: function (m) {
      muted = !!m;
      if (master) master.gain.value = muted ? 0 : 1;
    },
    stopAll: function () {
      live.slice().forEach(function (src) { cleanup(src, []); });
      live.length = 0;
    }
  };
})(window);
