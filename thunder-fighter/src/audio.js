/* ============================================================
 * thunder-fighter · src/audio.js —— SFX/BGM 全 WebAudio 合成
 * 军事科幻电子风，打击感优先：transient 锐利、层次分明。
 * 24 个 SFX cue + 3 轨 BGM(battle/boss/hangar)，零外部音频。
 *
 * master 链: (sfxBus | bgm链) -> master(gain) -> DynamicsCompressor -> destination
 * BGM 链:   trackGain -> bgmMix(0.25) -> duckG -> bgmOut(用户音量) -> master
 *
 * cue 时长表：
 *   ui .04  back .05  shoot1 .06  shoot2 .09  shoot3 .18  hit .04
 *   die1 .25  die2 .40  bigdie .90  bosshit .30  bossdie 1.8  bosswarn .90
 *   phurt .30  pdie 1.2  pu .25  coin .28  life .55  bomb 1.2
 *   shield .55  shieldbrk .45  clear .95  combo .05  graze .01  heart 循环
 * ============================================================ */
window.TF = window.TF || {};
TF.SFX = (function () {
  'use strict';

  /* ---------------- 内部状态 ---------------- */
  var ctx = null;        // AudioContext（惰性创建）
  var master = null;     // 总增益（muted 在此）
  var comp = null;       // DynamicsCompressor：多音叠加不削波
  var sfxBus = null;     // SFX 支路（用户 sfxVol）
  var bgmMix = null;     // BGM 混音级（内部固定 0.25 压低）
  var duckG = null;      // duck(ms,depth) 压 BGM
  var bgmOut = null;     // BGM 用户音量
  var noiseBuf = null;   // 共享 1s 白噪声
  var muted = false;
  var vBgm = 0.7, vSfx = 0.9;      // 用户音量（与 CFG 默认一致）
  var bound = false;
  var ovrBuf = {};       // name -> AudioBuffer（dataURL 解码成功，优先使用）
  var ovrPending = null; // 待解码 dataURL
  var CUR = { rate: 1, vol: 1 };   // play(opts) 注入，voice 内统一应用
  var CURTD = null;      // BGM 调度时的当前轨（voice 默认走向它）

  var NAMES = ['ui', 'back', 'shoot1', 'shoot2', 'shoot3', 'hit',
    'die1', 'die2', 'bigdie', 'bosshit', 'bossdie', 'bosswarn',
    'phurt', 'pdie', 'pu', 'coin', 'life', 'bomb',
    'shield', 'shieldbrk', 'clear', 'combo', 'graze', 'heart'];

  /* ---------------- 小工具 ---------------- */
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function mf(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  /* 节点用完 stop -> onended -> 全员 disconnect，防泄漏 */
  function track(src, nodes, live) {
    if (live) live.push(src);
    src.onended = function () {
      if (live) {
        var i = live.indexOf(src);
        if (i >= 0) live.splice(i, 1);
      }
      for (var j = 0; j < nodes.length; j++) {
        try { nodes[j].disconnect(); } catch (e) {}
      }
      src.onended = null;
    };
  }

  function killLive(arr) {
    var a = arr.splice(0, arr.length);
    for (var i = 0; i < a.length; i++) {
      try { a[i].stop(0); } catch (e) {}
    }
  }

  /* BGM voice 默认走向当前轨 */
  function D(o) {
    if (CURTD) {
      if (!o.dest) o.dest = CURTD.gain;
      if (!o.live) o.live = CURTD.live;
    }
    return o;
  }

  /* ---------------- 基础 voice ----------------
   * vo: 振荡器（可选滤波/滑频/失谐/保持段）
   * CUR.rate 缩放音高与时长，CUR.vol 缩放峰值 —— 全 cue 支持 rate/vol */
  function vo(o) {
    if (!ctx) return null;
    var R = CUR.rate, V = CUR.vol;
    var osc = null, g = null, fl = null, started = false;
    try {
      var t0 = o.t, dest = o.dest || sfxBus;
      var dur = Math.max(0.008, (o.dur || 0.1) / R);
      var f0 = Math.max(1, (o.f || 440) * R);
      osc = ctx.createOscillator();
      osc.type = o.type || 'sine';
      try { osc.frequency.value = f0; } catch (e) {}
      if (o.f2) {
        osc.frequency.setValueAtTime(f0, t0);
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(1, o.f2 * R), t0 + Math.min(dur, o.slide != null ? o.slide / R : dur));
      }
      if (o.det) { try { osc.detune.value = o.det; } catch (e) {} }
      g = ctx.createGain();
      var pk = Math.max(0.0002, (o.peak || 0.1) * V);
      var a = Math.min(o.a != null ? o.a / R : 0.005, dur * 0.6);
      g.gain.setValueAtTime(0.0002, t0);
      g.gain.exponentialRampToValueAtTime(pk, t0 + a);
      if (o.h) g.gain.setValueAtTime(pk, t0 + Math.min(o.h / R, dur * 0.85));
      g.gain.exponentialRampToValueAtTime(0.0002, t0 + dur);
      var nodes = [osc, g];
      if (o.ft) {
        fl = ctx.createBiquadFilter();
        fl.type = o.ft;
        fl.Q.value = o.q || 0.8;
        fl.frequency.setValueAtTime(Math.max(10, (o.fq || 1000) * R), t0);
        if (o.fq2) fl.frequency.exponentialRampToValueAtTime(Math.max(10, o.fq2 * R), t0 + dur);
        osc.connect(fl); fl.connect(g); nodes.push(fl);
      } else {
        osc.connect(g);
      }
      g.connect(dest);
      osc.start(t0); started = true;
      osc.stop(t0 + dur + 0.06);
      track(osc, nodes, o.live || null);
      return osc;
    } catch (e) {
      try { if (started && osc) osc.stop(0); } catch (e2) {}
      try { if (osc) osc.disconnect(); } catch (e3) {}
      try { if (fl) fl.disconnect(); } catch (e4) {}
      try { if (g) g.disconnect(); } catch (e5) {}
      return null;
    }
  }

  /* nz: 噪声 voice（带通/低通/高通 + 滑频） */
  function nz(o) {
    if (!ctx || !noiseBuf) return null;
    var R = CUR.rate, V = CUR.vol;
    var src = null, g = null, fl = null, started = false;
    try {
      var t0 = o.t, dest = o.dest || sfxBus;
      var dur = Math.max(0.006, (o.dur || 0.1) / R);
      src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      fl = ctx.createBiquadFilter();
      fl.type = o.ft || 'bandpass';
      fl.Q.value = o.q || 1;
      fl.frequency.setValueAtTime(Math.max(10, (o.f || 1000) * R), t0);
      if (o.f2) fl.frequency.exponentialRampToValueAtTime(Math.max(10, o.f2 * R), t0 + dur);
      g = ctx.createGain();
      var pk = Math.max(0.0002, (o.peak || 0.1) * V);
      var a = Math.min(o.a != null ? o.a / R : 0.004, dur * 0.5);
      g.gain.setValueAtTime(0.0002, t0);
      g.gain.exponentialRampToValueAtTime(pk, t0 + a);
      g.gain.exponentialRampToValueAtTime(0.0002, t0 + dur);
      src.connect(fl); fl.connect(g); g.connect(dest);
      src.start(t0, Math.random() * 0.4); started = true;
      src.stop(t0 + dur + 0.06);
      track(src, [src, fl, g], o.live || null);
      return src;
    } catch (e) {
      try { if (started && src) src.stop(0); } catch (e2) {}
      try { if (src) src.disconnect(); } catch (e3) {}
      try { if (fl) fl.disconnect(); } catch (e4) {}
      try { if (g) g.disconnect(); } catch (e5) {}
      return null;
    }
  }

  /* 高频 click：transient 点睛 */
  function click(t, peak, f) {
    nz({ t: t, dur: 0.012, peak: peak, ft: 'highpass', f: f || 5500, q: 0.7 });
  }

  /* ================= 24 个 SFX cue ================= */
  var cues = {
    /* ui：短 click */
    ui: function (t) {
      vo({ t: t, type: 'square', f: 1250, f2: 880, dur: 0.035, a: 0.002,
        peak: 0.10, ft: 'lowpass', fq: 3200, q: 0.6 });
      click(t, 0.06, 5000);
    },
    /* back：低 click */
    back: function (t) {
      vo({ t: t, type: 'square', f: 520, f2: 400, dur: 0.045, a: 0.002,
        peak: 0.11, ft: 'lowpass', fq: 1500, q: 0.7 });
      nz({ t: t, dur: 0.02, peak: 0.05, ft: 'lowpass', f: 900, q: 0.7 });
    },
    /* shoot1：轻快 blip，6ms attack 短方波，自带低音量，120ms 连发不刺耳 */
    shoot1: function (t) {
      vo({ t: t, type: 'square', f: 1560, f2: 880, dur: 0.055, a: 0.006,
        peak: 0.07, ft: 'lowpass', fq: 4200, q: 0.6 });
      nz({ t: t, dur: 0.016, peak: 0.025, ft: 'highpass', f: 6200, q: 0.7 });
    },
    /* shoot2：中性双音 */
    shoot2: function (t) {
      vo({ t: t, type: 'triangle', f: 990, f2: 900, dur: 0.05, a: 0.004, peak: 0.10 });
      vo({ t: t + 0.035, type: 'square', f: 1320, f2: 1150, dur: 0.05, a: 0.003,
        peak: 0.08, ft: 'lowpass', fq: 3600, q: 0.6 });
    },
    /* shoot3：低频重炮 thump（正弦 90→50Hz + 短 noise） */
    shoot3: function (t) {
      vo({ t: t, type: 'sine', f: 90, f2: 50, dur: 0.17, a: 0.004, peak: 0.5 });
      nz({ t: t, dur: 0.05, peak: 0.16, ft: 'lowpass', f: 520, f2: 160, q: 0.8 });
      click(t, 0.05, 3800);
    },
    /* hit：打击点 —— 1-3kHz noise burst 30ms + 高频 click，短促有力 */
    hit: function (t) {
      nz({ t: t, dur: 0.03, peak: 0.30, ft: 'bandpass', f: 2600, f2: 1100, q: 0.8 });
      click(t, 0.12, 6800);
      vo({ t: t, type: 'sine', f: 190, f2: 120, dur: 0.035, a: 0.002, peak: 0.16 });
    },
    /* die1：小爆 0.25s */
    die1: function (t) {
      nz({ t: t, dur: 0.22, peak: 0.30, ft: 'lowpass', f: 2000, f2: 280, q: 0.6 });
      vo({ t: t, type: 'sine', f: 250, f2: 70, dur: 0.2, a: 0.003, peak: 0.26 });
      click(t, 0.10, 4200);
    },
    /* die2：中爆 0.4s */
    die2: function (t) {
      nz({ t: t, dur: 0.34, peak: 0.36, ft: 'lowpass', f: 2400, f2: 180, q: 0.6 });
      nz({ t: t + 0.05, dur: 0.2, peak: 0.14, ft: 'bandpass', f: 900, f2: 300, q: 1 });
      vo({ t: t, type: 'sine', f: 300, f2: 60, dur: 0.32, a: 0.003, peak: 0.34 });
      vo({ t: t + 0.02, type: 'sine', f: 60, f2: 42, dur: 0.16, a: 0.003, peak: 0.3 });
      click(t, 0.12, 4500);
    },
    /* bigdie 大爆 ~0.9s：noise band 800→200 + 正弦 300→60 + 45Hz sub + 二次爆 */
    bigdie: function (t) {
      nz({ t: t, dur: 0.68, peak: 0.42, ft: 'bandpass', f: 800, f2: 200, q: 0.7 });
      vo({ t: t, type: 'sine', f: 300, f2: 60, dur: 0.6, a: 0.004, peak: 0.4 });
      vo({ t: t, type: 'sine', f: 80, f2: 45, dur: 0.3, a: 0.003, peak: 0.5 });
      click(t, 0.16, 4000);
      nz({ t: t + 0.28, dur: 0.32, peak: 0.2, ft: 'bandpass', f: 600, f2: 150, q: 0.8 });
      vo({ t: t + 0.28, type: 'sine', f: 190, f2: 55, dur: 0.3, a: 0.004, peak: 0.26 });
      nz({ t: t + 0.55, dur: 0.3, peak: 0.12, ft: 'lowpass', f: 240, f2: 90, q: 0.6 });
    },
    /* bosshit：金属命中 —— 方波泛音簇 + 失谐拍频 */
    bosshit: function (t) {
      var ps = [[523, 0.10], [851, 0.08], [1274, 0.06], [2032, 0.045]];
      for (var i = 0; i < ps.length; i++) {
        vo({ t: t, type: 'square', f: ps[i][0], dur: 0.28 - i * 0.05, a: 0.002,
          peak: ps[i][1], det: i % 2 ? 9 : -7, ft: 'bandpass', fq: 2400, q: 0.9 });
        vo({ t: t, type: 'square', f: ps[i][0] * 1.007, dur: 0.22 - i * 0.04,
          a: 0.002, peak: ps[i][1] * 0.6, ft: 'lowpass', fq: 5200, q: 0.6 });
      }
      nz({ t: t, dur: 0.045, peak: 0.2, ft: 'bandpass', f: 3200, f2: 1400, q: 0.8 });
      vo({ t: t, type: 'sine', f: 150, f2: 95, dur: 0.06, a: 0.002, peak: 0.22 });
    },
    /* bossdie：超长连环爆底 ~1.8s 多层 + 金属碎片 + 低频 rumble */
    bossdie: function (t) {
      nz({ t: t, dur: 0.9, peak: 0.40, ft: 'bandpass', f: 900, f2: 160, q: 0.7 });
      vo({ t: t, type: 'sine', f: 280, f2: 50, dur: 0.85, a: 0.004, peak: 0.4 });
      vo({ t: t, type: 'sine', f: 85, f2: 45, dur: 0.35, a: 0.003, peak: 0.5 });
      nz({ t: t + 0.4, dur: 0.55, peak: 0.28, ft: 'bandpass', f: 700, f2: 140, q: 0.8 });
      vo({ t: t + 0.4, type: 'sine', f: 210, f2: 55, dur: 0.5, a: 0.004, peak: 0.3 });
      nz({ t: t + 0.8, dur: 0.6, peak: 0.26, ft: 'bandpass', f: 520, f2: 110, q: 0.8 });
      vo({ t: t + 0.8, type: 'sine', f: 170, f2: 48, dur: 0.55, a: 0.004, peak: 0.3 });
      nz({ t: t + 1.15, dur: 0.35, peak: 0.16, ft: 'bandpass', f: 420, f2: 120, q: 0.9 });
      var dings = [0.5, 0.72, 1.02, 1.3];
      for (var i = 0; i < dings.length; i++) {
        vo({ t: t + dings[i], type: 'triangle', f: 1800 + ((i * 673) % 1400),
          dur: 0.14, a: 0.002, peak: 0.05, ft: 'highpass', fq: 1400, q: 0.7 });
      }
      nz({ t: t + 0.2, dur: 1.5, peak: 0.16, a: 0.05, ft: 'lowpass', f: 160, f2: 55, q: 0.5 });
    },
    /* bosswarn：警笛双音交替两轮（659/523Hz 方波） */
    bosswarn: function (t) {
      var seq = [659, 523, 659, 523];
      for (var i = 0; i < 4; i++) {
        vo({ t: t + i * 0.22, type: 'square', f: seq[i], dur: 0.21, a: 0.01, h: 0.16,
          peak: 0.10, ft: 'lowpass', fq: 2600, q: 0.7 });
      }
    },
    /* phurt：受创闷响 + 短哨下行 */
    phurt: function (t) {
      nz({ t: t, dur: 0.13, peak: 0.26, ft: 'lowpass', f: 420, f2: 140, q: 0.7 });
      vo({ t: t, type: 'sine', f: 150, f2: 70, dur: 0.13, a: 0.003, peak: 0.28 });
      vo({ t: t + 0.03, type: 'sine', f: 1500, f2: 640, dur: 0.26, a: 0.02, peak: 0.09 });
    },
    /* pdie：坠机长下滑 1.2s */
    pdie: function (t) {
      vo({ t: t, type: 'sawtooth', f: 340, f2: 42, dur: 1.05, a: 0.006,
        peak: 0.24, ft: 'lowpass', fq: 1300, fq2: 260, q: 0.7 });
      nz({ t: t, dur: 0.9, peak: 0.30, ft: 'lowpass', f: 2200, f2: 130, q: 0.6 });
      vo({ t: t, type: 'sine', f: 230, f2: 46, dur: 0.85, a: 0.004, peak: 0.26 });
      vo({ t: t + 0.85, type: 'sine', f: 64, f2: 38, dur: 0.32, a: 0.004, peak: 0.34 });
      click(t, 0.10, 4200);
    },
    /* pu：道具上行双音 */
    pu: function (t) {
      vo({ t: t, type: 'triangle', f: 660, dur: 0.09, a: 0.004, peak: 0.16 });
      vo({ t: t + 0.085, type: 'triangle', f: 990, dur: 0.16, a: 0.004, peak: 0.18 });
      nz({ t: t + 0.085, dur: 0.1, peak: 0.035, ft: 'highpass', f: 7000, q: 0.7 });
    },
    /* coin：亮 ping（2kHz + 泛音） */
    coin: function (t) {
      vo({ t: t, type: 'sine', f: 1976, dur: 0.26, a: 0.002, peak: 0.15 });
      vo({ t: t, type: 'sine', f: 2637, dur: 0.16, a: 0.002, peak: 0.06 });
      vo({ t: t + 0.012, type: 'sine', f: 3951, dur: 0.09, a: 0.002, peak: 0.035 });
      click(t, 0.04, 7000);
    },
    /* life：上行三连音 */
    life: function (t) {
      var seq = [523.25, 659.25, 783.99];
      for (var i = 0; i < 3; i++) {
        vo({ t: t + i * 0.1, type: 'triangle', f: seq[i],
          dur: i === 2 ? 0.34 : 0.12, a: 0.004, peak: 0.15 + i * 0.025 });
      }
      nz({ t: t + 0.2, dur: 0.2, peak: 0.03, ft: 'highpass', f: 6800, q: 0.7 });
    },
    /* bomb：全频冲击 —— sub 40Hz + 白噪 fall + 高频 shimmer 长尾 */
    bomb: function (t) {
      vo({ t: t, type: 'sine', f: 56, f2: 38, dur: 0.6, a: 0.003, peak: 0.55 });
      nz({ t: t, dur: 0.8, peak: 0.36, ft: 'lowpass', f: 6000, f2: 180, q: 0.6 });
      nz({ t: t, dur: 0.5, peak: 0.26, ft: 'bandpass', f: 900, f2: 140, q: 0.8 });
      nz({ t: t + 0.05, dur: 1.15, a: 0.03, peak: 0.05, ft: 'highpass', f: 6500, q: 0.5 });
      click(t, 0.18, 5200);
    },
    /* shield：护盾展开上升嗡鸣 */
    shield: function (t) {
      vo({ t: t, type: 'sawtooth', f: 130, f2: 520, dur: 0.5, a: 0.05,
        peak: 0.09, ft: 'bandpass', fq: 300, fq2: 1400, q: 2.2 });
      vo({ t: t + 0.08, type: 'sine', f: 880, f2: 1760, dur: 0.4, a: 0.04, peak: 0.05 });
      nz({ t: t, dur: 0.45, a: 0.05, peak: 0.045, ft: 'highpass', f: 3000, q: 0.6 });
    },
    /* shieldbrk：碎裂 —— 多个短高频 ping 错落 */
    shieldbrk: function (t) {
      nz({ t: t, dur: 0.2, peak: 0.18, ft: 'highpass', f: 4200, q: 0.7 });
      var pings = [[3400, 0], [4100, 0.05], [5200, 0.09], [3700, 0.14],
                   [6000, 0.19], [4600, 0.24], [5600, 0.3]];
      for (var i = 0; i < pings.length; i++) {
        vo({ t: t + pings[i][1], type: 'triangle', f: pings[i][0], dur: 0.08,
          a: 0.002, peak: 0.07, ft: 'highpass', fq: 2000, q: 0.7 });
      }
      nz({ t: t + 0.03, dur: 0.14, peak: 0.12, ft: 'bandpass', f: 2400, f2: 900, q: 1 });
    },
    /* clear：通关上行大琶音 */
    clear: function (t) {
      var seq = [392, 523.25, 659.25, 783.99, 1046.5];
      for (var i = 0; i < seq.length; i++) {
        vo({ t: t + i * 0.11, type: 'triangle', f: seq[i],
          dur: i === 4 ? 0.75 : 0.16, a: 0.005, h: i === 4 ? 0.3 : 0.06,
          peak: 0.13 + i * 0.015 });
        if (i >= 2) {
          vo({ t: t + i * 0.11, type: 'square', f: seq[i] * 2, dur: 0.12, a: 0.004,
            peak: 0.03, ft: 'lowpass', fq: 4200, q: 0.6 });
        }
      }
      vo({ t: t + 0.44, type: 'sine', f: 1568, dur: 0.5, a: 0.005, peak: 0.07 });
      nz({ t: t + 0.44, dur: 0.35, peak: 0.03, ft: 'highpass', f: 7000, q: 0.7 });
    },
    /* combo：短 blip，opts.rate 控制音高随连击上行（rate 由游戏传） */
    combo: function (t) {
      vo({ t: t, type: 'square', f: 640, f2: 900, dur: 0.05, a: 0.003,
        peak: 0.11, ft: 'lowpass', fq: 4200, q: 0.7 });
      vo({ t: t, type: 'sine', f: 320, dur: 0.04, a: 0.002, peak: 0.06 });
    },
    /* graze：极短 8ms tick */
    graze: function (t) {
      nz({ t: t, dur: 0.008, peak: 0.09, ft: 'highpass', f: 7200, q: 0.7 });
      vo({ t: t, type: 'sine', f: 5200, dur: 0.008, a: 0.001, peak: 0.04 });
    },
    /* heart：低血心跳 咚-咚 双低频（由循环注册表驱动，播放入口在 play 特判） */
    heart: function (t, live) {
      vo({ t: t, type: 'sine', f: 78, f2: 46, dur: 0.13, a: 0.004,
        peak: 0.4, ft: 'lowpass', fq: 220, q: 0.6, live: live || null });
      vo({ t: t + 0.2, type: 'sine', f: 66, f2: 44, dur: 0.11, a: 0.004,
        peak: 0.28, ft: 'lowpass', fq: 200, q: 0.6, live: live || null });
    }
  };

  /* ================= heart 循环注册表 ================= */
  var heart = { on: false, timer: null, live: [], vol: 1, next: 0 };
  var HEART_GAP = 0.85;

  function heartTick() {
    if (!ctx || !heart.on) return;
    CUR.rate = 1; CUR.vol = heart.vol;
    var horizon = ctx.currentTime + 0.25, guard = 0;
    while (heart.next < horizon && guard++ < 8) {
      cues.heart(Math.max(ctx.currentTime + 0.02, heart.next), heart.live);
      heart.next += HEART_GAP;
    }
  }

  function startHeart(vol) {
    if (!ensure()) return;
    if (vol != null && isFinite(vol)) heart.vol = clamp(+vol, 0, 2);
    if (heart.on) return;               // 幂等：重复 play('heart') 不叠层
    heart.on = true;
    heart.next = ctx.currentTime + 0.05;
    if (heart.timer) clearInterval(heart.timer);
    heart.timer = setInterval(heartTick, 120);
    heartTick();
  }

  function stopHeart() {
    heart.on = false;
    if (heart.timer) { clearInterval(heart.timer); heart.timer = null; }
    killLive(heart.live);
  }

  /* ================= BGM 三轨 =================
   * battle 140BPM 四小节：四踩 kick + 锯齿 bass 十六分 + 方波 lead（A 小调推进）
   * boss   160BPM 两小节：半音阶 ostinato 压迫 + 不协和 stab
   * hangar 84BPM  四小节：detune 双锯齿 pad + 慢琶音（舒缓）
   * BGM 内部混音级 bgmMix=0.25 压低不抢音效。 */

  function bKick(t, f) {
    vo(D({ t: t, type: 'sine', f: f, f2: 42, slide: 0.09, dur: 0.14, a: 0.003, peak: 0.5 }));
  }
  function bBass(f, t, dur, pk) {
    vo(D({ t: t, type: 'sawtooth', f: f, dur: dur, a: 0.004, peak: pk,
      ft: 'lowpass', fq: 820, q: 0.7 }));
  }
  function bHat(t, pk) {
    nz(D({ t: t, dur: 0.03, peak: pk, ft: 'highpass', f: 7500, q: 0.7 }));
  }
  function bSnare(t) {
    nz(D({ t: t, dur: 0.09, peak: 0.085, ft: 'bandpass', f: 1900, q: 0.8 }));
    nz(D({ t: t, dur: 0.05, peak: 0.05, ft: 'highpass', f: 4000, q: 0.7 }));
  }
  function bLead(f, t, dur) {
    f = f * (1 + (Math.random() * 0.006 - 0.003));
    vo(D({ t: t, type: 'square', f: f, dur: dur, a: 0.008, h: dur * 0.3,
      peak: 0.085, ft: 'lowpass', fq: 2600, q: 0.6, det: Math.random() * 8 - 4 }));
  }

  /* --- battle --- */
  var B_ROOTS = [33, 33, 29, 31];      // A1 A1 F1 G1
  var B_LEAD = {};
  (function () {
    var L = [[0, 69, 2], [3, 72, 1], [6, 76, 3], [10, 74, 2], [12, 72, 2],
             [16, 69, 2], [19, 72, 1], [22, 76, 2], [24, 79, 3], [28, 76, 2], [30, 74, 2],
             [32, 77, 2], [35, 81, 2], [38, 79, 3], [42, 77, 2], [44, 76, 2], [46, 72, 2],
             [48, 74, 2], [51, 79, 2], [54, 83, 2], [56, 79, 2], [59, 79, 1], [60, 76, 3]];
    for (var i = 0; i < L.length; i++) B_LEAD[L[i][0]] = [L[i][1], L[i][2]];
  })();

  function battleStep(td, s, t) {
    var bar = (s >> 4) & 3, pos = s & 15, root = B_ROOTS[bar];
    var st = 60 / td.bpm / 4;
    if (pos % 4 === 0) bKick(t, 150);
    if (pos === 4 || pos === 12) bSnare(t);
    if (pos % 2 === 1) bHat(t, pos === 15 ? 0.05 : 0.028);
    var off = (pos % 4 === 2) ? 12 : 0;
    if (pos === 14) off = 7;             // 五度经过音
    bBass(mf(root + off), t, st * 0.92, pos % 4 === 0 ? 0.26 : 0.2);
    var m = B_LEAD[s];
    if (m) bLead(mf(m[0]), t, m[1] * st * 0.9);
  }

  /* --- boss：半音阶压迫 --- */
  var BOSS_RIFF = [0, 1, 0, -1, 0, 1, 3, 1];   // E2 上的半音阶动机
  function bossStep(td, s, t) {
    var pos = s & 31;
    if (pos === 0 || pos === 8 || pos === 16 || pos === 24) bKick(t, 120);
    if (pos === 28) bKick(t, 100);
    if (pos === 8 || pos === 24) bSnare(t);
    if (pos % 2 === 1) bHat(t, 0.022);
    if (pos % 2 === 0) {
      var off = BOSS_RIFF[(s >> 1) & 7];
      bBass(mf(40 + off), t, 0.11, pos % 8 === 0 ? 0.3 : 0.24);
    }
    if (pos === 4 || pos === 20) {       // 三全音+小二度不协和 stab
      vo(D({ t: t, type: 'square', f: mf(64), dur: 0.13, a: 0.004, peak: 0.045, ft: 'lowpass', fq: 1900, q: 0.6 }));
      vo(D({ t: t, type: 'square', f: mf(70), dur: 0.13, a: 0.004, peak: 0.04, ft: 'lowpass', fq: 1900, q: 0.6 }));
      vo(D({ t: t, type: 'square', f: mf(65), dur: 0.1, a: 0.004, peak: 0.03, ft: 'lowpass', fq: 1600, q: 0.6 }));
    }
    if (pos === 0 || pos === 16) {       // 高频紧张脉冲 E5/F5 交替 + E1 sub
      vo(D({ t: t, type: 'square', f: mf(pos === 0 ? 76 : 77), dur: 0.55, a: 0.05,
        h: 0.3, peak: 0.028, ft: 'lowpass', fq: 3600, q: 0.6 }));
      vo(D({ t: t, type: 'sine', f: 41.2, dur: 0.3, a: 0.004, peak: 0.3 }));
    }
  }

  /* --- hangar：舒缓 pad + 慢琶音 --- */
  var H_CHORDS = [[45, 52, 55, 60], [41, 48, 52, 57], [48, 55, 59, 64], [40, 47, 50, 55]];
  function hangarStep(td, s, t) {
    var bar = (s >> 4) & 3, pos = s & 15, ch = H_CHORDS[bar];
    var barLen = 60 / td.bpm * 4;
    if (pos === 0) {
      for (var i = 0; i < ch.length; i++) {
        vo(D({ t: t, type: 'sawtooth', f: mf(ch[i]), dur: barLen, a: 0.7,
          h: barLen - 1.0, peak: 0.05, ft: 'lowpass', fq: 720, q: 0.4, det: -5 }));
        vo(D({ t: t, type: 'sawtooth', f: mf(ch[i]), dur: barLen, a: 0.7,
          h: barLen - 1.0, peak: 0.05, ft: 'lowpass', fq: 720, q: 0.4, det: 5 }));
      }
      vo(D({ t: t, type: 'sine', f: mf(ch[0] - 12), dur: 0.6, a: 0.01, peak: 0.1 }));
    }
    if (pos === 0 || pos === 3 || pos === 6 || pos === 10 || pos === 12) {
      var idx = [0, 1, 2, 3, 2][[0, 3, 6, 10, 12].indexOf(pos)];
      vo(D({ t: t, type: 'triangle', f: mf(ch[idx] + 12), dur: 0.5, a: 0.02,
        h: 0.15, peak: 0.06 }));
    }
    if (pos === 8) nz(D({ t: t, dur: 0.25, a: 0.05, peak: 0.012, ft: 'highpass', f: 8000, q: 0.6 }));
  }

  var tracks = {
    battle: { bpm: 140, total: 64, level: 1, stepFn: battleStep },
    boss: { bpm: 160, total: 32, level: 1.02, stepFn: bossStep },
    hangar: { bpm: 84, total: 64, level: 1, stepFn: hangarStep }
  };
  (function () {
    for (var n in tracks) {
      if (Object.prototype.hasOwnProperty.call(tracks, n)) {
        var td = tracks[n];
        td.gain = null; td.live = []; td.timer = null;
        td.step = 0; td.next = 0; td.on = false;
      }
    }
  })();
  var bgmName = null;
  var AHEAD = 0.15, TICK_MS = 25;

  function bgmTick(td) {
    if (!td.on || !ctx) return;
    CURTD = td; CUR.rate = 1; CUR.vol = 1;
    var st = 60 / td.bpm / 4;
    var horizon = ctx.currentTime + AHEAD, guard = 0;
    while (td.next < horizon && guard++ < 64) {
      td.stepFn(td, td.step, td.next);
      td.step = (td.step + 1) % td.total;
      td.next += st;
    }
    CURTD = null;
  }

  function fadeOut(td) {
    td.on = false;
    if (td.timer) { clearInterval(td.timer); td.timer = null; }
    try {
      var g = td.gain.gain, t = ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(0.0001, g.value), t);
      g.exponentialRampToValueAtTime(0.0001, t + 0.6);
    } catch (e) {}
    setTimeout(function () { killLive(td.live); }, 700);
  }

  function startBGM(name) {
    if (!ensure()) return;
    var td = tracks[name];
    if (!td) return;                     // 未知轨安全回落
    resumeCtx();
    if (bgmName === name && td.on) return;   // 同轨幂等
    if (bgmName && tracks[bgmName] && tracks[bgmName].on) fadeOut(tracks[bgmName]);
    bgmName = name;
    td.on = true; td.step = 0; td.next = ctx.currentTime + 0.06;
    try {
      var g = td.gain.gain, t = ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(0.0001, g.value), t);
      g.exponentialRampToValueAtTime(td.level, t + 0.6);   // 新轨 ramp in，切轨平滑
    } catch (e) {}
    if (td.timer) clearInterval(td.timer);
    td.timer = setInterval(function () { bgmTick(td); }, TICK_MS);
    bgmTick(td);
  }

  function stopBGM() {
    if (bgmName && tracks[bgmName]) {
      var td = tracks[bgmName];
      if (ctx) fadeOut(td);
      else { td.on = false; if (td.timer) { clearInterval(td.timer); td.timer = null; } }
    }
    bgmName = null;
  }

  /* ================= overrides（dataURL 自定义音频优先） ================= */
  function fetchAB(url) {
    return new Promise(function (res, rej) {
      try {
        if (typeof fetch === 'function') {
          fetch(url).then(function (r) { return r.arrayBuffer(); }).then(res, rej);
          return;
        }
      } catch (e) {}
      try {
        var x = new XMLHttpRequest();
        x.open('GET', url, true);
        x.responseType = 'arraybuffer';
        x.onload = function () { res(x.response); };
        x.onerror = function () { rej(new Error('xhr')); };
        x.send();
        return;
      } catch (e) {}
      rej(new Error('no-fetch'));
    });
  }

  function decodeAB(ab) {
    return new Promise(function (res, rej) {
      var done = false;
      function ok(b) { if (!done) { done = true; res(b); } }
      function bad(e) { if (!done) { done = true; rej(e || new Error('decode')); } }
      try {
        var p = ctx.decodeAudioData(ab, ok, bad);
        if (p && typeof p.then === 'function') p.then(ok, bad);
      } catch (e) { bad(e); }
    });
  }

  function decodePending() {
    if (!ctx || !ovrPending) return;
    var pend = ovrPending;
    ovrPending = null;
    for (var name in pend) {
      if (!Object.prototype.hasOwnProperty.call(pend, name)) continue;
      (function (n, url) {
        fetchAB(url).then(function (ab) { return decodeAB(ab); })
          .then(function (buf) { ovrBuf[n] = buf; })
          .catch(function () { delete ovrBuf[n]; });   // 解码失败回落合成
      })(name, pend[name]);
    }
  }

  function applyOverrides(map) {
    if (!map || typeof map !== 'object') return;
    for (var name in map) {
      if (!Object.prototype.hasOwnProperty.call(map, name)) continue;
      var v = map[name];
      if (!v) { delete ovrBuf[name]; continue; }
      if (typeof v === 'string' && v.indexOf('data:') === 0) {
        ovrPending = ovrPending || {};
        ovrPending[name] = v;
      }
      /* 非 dataURL 字符串/其他类型：忽略，走合成 */
    }
    decodePending();
  }

  /* ================= 生命周期 ================= */
  function ensure() {
    if (ctx) return true;
    var AC = (typeof window !== 'undefined') &&
      (window.AudioContext || window.webkitAudioContext);
    if (!AC) return false;
    try { ctx = new AC(); } catch (e) { ctx = null; return false; }
    try {
      master = ctx.createGain();
      master.gain.value = muted ? 0.0001 : 1;
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 8;
      comp.attack.value = 0.002; comp.release.value = 0.15;
      master.connect(comp); comp.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.gain.value = vSfx; sfxBus.connect(master);
      bgmMix = ctx.createGain(); bgmMix.gain.value = 0.25;   // BGM 压低 ~0.25
      duckG = ctx.createGain(); duckG.gain.value = 1;
      bgmOut = ctx.createGain(); bgmOut.gain.value = vBgm;
      bgmMix.connect(duckG); duckG.connect(bgmOut); bgmOut.connect(master);
      for (var n in tracks) {
        if (Object.prototype.hasOwnProperty.call(tracks, n)) {
          var td = tracks[n];
          td.gain = ctx.createGain();
          td.gain.gain.value = 0.0001;
          td.gain.connect(bgmMix);
        }
      }
      var sr = ctx.sampleRate || 44100;
      noiseBuf = ctx.createBuffer(1, sr, sr);
      var ch = noiseBuf.getChannelData(0);
      for (var i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    } catch (e) {}
    bindOnce();
    decodePending();
    return true;
  }

  function resumeCtx() {
    if (!ctx || ctx.state !== 'suspended' || !ctx.resume) return;
    try {
      var p = ctx.resume();
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }

  function onVis() {
    if (!ctx) return;
    if (document.hidden) stopBGM();      // 停 BGM；回来不自动续，游戏层控制
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

  /* 未知名安全回落：极轻中性 tick，不抛错 */
  function generic(t) {
    vo({ t: t, type: 'square', f: 980, f2: 760, dur: 0.03, a: 0.002,
      peak: 0.06, ft: 'lowpass', fq: 3000, q: 0.6 });
  }

  function playBuf(buf, t) {
    var src = ctx.createBufferSource();
    src.buffer = buf;
    try { src.playbackRate.value = CUR.rate; } catch (e) {}
    var g = ctx.createGain();
    try { g.gain.setValueAtTime(Math.max(0.0002, CUR.vol), t); } catch (e) {}
    src.connect(g); g.connect(sfxBus);
    src.start(t);
    var d = 0.5;
    try { d = (buf.duration || 0.4) / CUR.rate; } catch (e) {}
    src.stop(t + d + 0.05);
    track(src, [src, g], null);
  }

  /* ---------------- 对外接口 ---------------- */
  function init() { ensure(); }

  function unlock() {                    // 幂等：iOS 首手势 resume
    if (!ensure()) return;
    resumeCtx();
  }

  function play(name, opts) {
    if (name === 'heart') {              // 循环型 cue 走注册表
      if (ensure()) startHeart(opts && opts.vol);
      return;
    }
    if (!ensure()) return;
    var o = opts || {};
    CUR.rate = clamp(+o.rate || 1, 0.25, 4);
    CUR.vol = clamp(o.vol == null ? 1 : +o.vol, 0, 4);
    try {
      var t0 = ctx.currentTime + 0.02;
      if (ctx.state === 'suspended') resumeCtx();
      var buf = ovrBuf[name];
      if (buf) { playBuf(buf, t0); return; }          // 自定义音频优先
      var c = cues[name];
      if (c) c(t0);
      else generic(t0);                                // name 不在表内：安全回落
    } catch (e) {} finally {
      CUR.rate = 1; CUR.vol = 1;
    }
  }

  /* 循环型 cue 停止（heart）；其他一次性 cue 无需 stop */
  function stop(name) {
    if (name === 'heart') stopHeart();
  }

  function duck(ms, depth) {             // 大爆时压 BGM
    if (!ctx || !duckG) return;
    try {
      var t = ctx.currentTime;
      var d = clamp(depth == null ? 0.65 : depth, 0, 0.95);
      var hold = clamp(ms == null ? 600 : ms, 50, 4000) / 1000;
      duckG.gain.cancelScheduledValues(t);
      duckG.gain.setValueAtTime(Math.max(0.0001, duckG.gain.value), t);
      duckG.gain.linearRampToValueAtTime(1 - d, t + 0.04);
      duckG.gain.setValueAtTime(1 - d, t + hold);
      duckG.gain.linearRampToValueAtTime(1, t + hold + 0.25);
    } catch (e) {}
  }

  function setVol(bgm, sfx) {
    if (bgm != null && isFinite(bgm)) vBgm = clamp(+bgm, 0, 1);
    if (sfx != null && isFinite(sfx)) vSfx = clamp(+sfx, 0, 1);
    if (!ctx) return;
    try {
      var t = ctx.currentTime;
      bgmOut.gain.cancelScheduledValues(t);
      bgmOut.gain.setTargetAtTime(vBgm, t, 0.03);
      sfxBus.gain.cancelScheduledValues(t);
      sfxBus.gain.setTargetAtTime(vSfx, t, 0.03);
    } catch (e) {}
  }

  function setMuted(b) {
    muted = !!b;
    if (!ctx || !master) return;
    try {
      var t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setTargetAtTime(muted ? 0.0001 : 1, t, 0.015);
    } catch (e) {
      try { master.gain.value = muted ? 0.0001 : 1; } catch (e2) {}
    }
  }

  return {
    init: init,
    unlock: unlock,
    play: play,
    stop: stop,
    startBGM: startBGM,
    stopBGM: stopBGM,
    duck: duck,
    setVol: setVol,
    muted: setMuted,
    applyOverrides: applyOverrides,
    names: NAMES
  };
})();
