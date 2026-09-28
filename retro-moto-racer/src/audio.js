/* ============================================================
 * retro-moto-racer · src/audio.js —— RM.AUDIO
 * 全 WebAudio 合成 8-bit 音色，零外部音频文件。
 * 架构照抄 thunder-fighter/TF.SFX：master 链 + BGM 步进音序器 +
 * unlock 幂等 + applyOverrides，音色全部重写为街机赛车味。
 *
 * 信号链:  sfxBus(用户sfx) ─────────────┐
 *          engine(引擎+风噪, 常驻节点) ──┤-> master(用户master×mute)
 *          bgmOut(用户bgm) <- duckG <- bgmMix(0.3) <- trackGain×3
 *                                        └-> DynamicsCompressor -> destination
 *
 * SFX(13): click/beep/tick/count/go/bump/barrel/nitro/
 *          checkpoint/stage/finish/gameover/timeup
 * BGM(3):  menu   88bpm  慵懒小调 Am-F-C-G（三角波 lead+bass，轻）
 *          race1  132bpm 「sunrise」C 大调五声推进：方波 lead+三角 bass+噪声 hat
 *          race2  118bpm 「midnight」Em 小调：切分 bass+暗色方波 lead
 * 引擎:    锯齿主音+方波低八度 -> lowpass(300..1800Hz 随速)，
 *          pitch = 55 + speed01*165（nitro ×1.12），setTargetAtTime 防 zipper；
 *          LFO 气缸抖动；nitro 混入带通白噪风层。振荡器/噪声常驻，
 *          engineUpdate 每帧只动参数，零节点创建。
 * applyOverrides({bgm:'sunrise'|'midnight'|...}): 指定菜单 BGM 曲目
 *          （设置面板 menu 曲×2），falsy 复位；也支持 {menu|race1|race2:id} 任意换轨。
 * ============================================================ */
window.RM = window.RM || {};
window.RM.AUDIO = (function () {
  'use strict';

  /* ---------------- 内部状态 ---------------- */
  var ctx = null;        // AudioContext（惰性创建）
  var master = null;     // 总增益（muted × 在此）
  var comp = null;       // 压缩器：多音叠加不削波
  var sfxBus = null;     // SFX + 引擎支路（用户 sfx 音量）
  var bgmMix = null;     // BGM 内部混音级（固定压低）
  var duckG = null;      // duck(ms,depth) 压 BGM
  var bgmOut = null;     // BGM 用户音量
  var noiseBuf = null;   // 共享 1s 白噪声（预生成）
  var muted = false;
  var vMaster = 0.9, vBgm = 0.5, vSfx = 0.9;   // 初始三层音量（cfg.sound 默认）
  var bound = false;

  var NAMES = ['click', 'beep', 'tick', 'count', 'go', 'bump', 'barrel',
    'nitro', 'checkpoint', 'stage', 'finish', 'gameover', 'timeup'];

  /* ---------------- 小工具 ---------------- */
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function mf(m) { return 440 * Math.pow(2, (m - 69) / 12); }   // MIDI -> Hz

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

  /* BGM voice 默认走向当前调度中的轨 */
  var CURTD = null;
  function D(o) {
    if (CURTD) {
      if (!o.dest) o.dest = CURTD.gain;
      if (!o.live) o.live = CURTD.live;
    }
    return o;
  }

  /* ---------------- 基础 voice ----------------
   * vo: 振荡器（可选滤波/滑频/失谐/保持段）—— 8-bit 干净音色核心 */
  function vo(o) {
    if (!ctx) return null;
    var osc = null, g = null, fl = null, started = false;
    try {
      var t0 = o.t, dest = o.dest || sfxBus;
      var dur = Math.max(0.008, o.dur || 0.1);
      var f0 = Math.max(1, o.f || 440);
      osc = ctx.createOscillator();
      osc.type = o.type || 'square';
      try { osc.frequency.value = f0; } catch (e) {}
      if (o.f2) {
        osc.frequency.setValueAtTime(f0, t0);
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(1, o.f2), t0 + Math.min(dur, o.slide != null ? o.slide : dur));
      }
      if (o.det) { try { osc.detune.value = o.det; } catch (e) {} }
      g = ctx.createGain();
      var pk = Math.max(0.0002, o.peak || 0.1);
      var a = Math.min(o.a != null ? o.a : 0.005, dur * 0.6);
      g.gain.setValueAtTime(0.0002, t0);
      g.gain.exponentialRampToValueAtTime(pk, t0 + a);
      if (o.h) g.gain.setValueAtTime(pk, t0 + Math.min(o.h, dur * 0.85));
      g.gain.exponentialRampToValueAtTime(0.0002, t0 + dur);
      var nodes = [osc, g];
      if (o.ft) {
        fl = ctx.createBiquadFilter();
        fl.type = o.ft;
        fl.Q.value = o.q || 0.8;
        fl.frequency.setValueAtTime(Math.max(10, o.fq || 1000), t0);
        if (o.fq2) fl.frequency.exponentialRampToValueAtTime(Math.max(10, o.fq2), t0 + dur);
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
    var src = null, g = null, fl = null, started = false;
    try {
      var t0 = o.t, dest = o.dest || sfxBus;
      var dur = Math.max(0.006, o.dur || 0.1);
      src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      fl = ctx.createBiquadFilter();
      fl.type = o.ft || 'bandpass';
      fl.Q.value = o.q || 1;
      fl.frequency.setValueAtTime(Math.max(10, o.f || 1000), t0);
      if (o.f2) fl.frequency.exponentialRampToValueAtTime(Math.max(10, o.f2), t0 + dur);
      g = ctx.createGain();
      var pk = Math.max(0.0002, o.peak || 0.1);
      var a = Math.min(o.a != null ? o.a : 0.004, dur * 0.5);
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

  /* ================= 13 个 SFX cue ================= */
  var cues = {
    /* click：短方波 tick（UI 确认） */
    click: function (t) {
      vo({ t: t, type: 'square', f: 1150, f2: 880, dur: 0.03, a: 0.002,
        peak: 0.09, ft: 'lowpass', fq: 3200, q: 0.6 });
    },
    /* beep：880Hz 方波短哔（与 tick 同族，稍长） */
    beep: function (t) {
      vo({ t: t, type: 'square', f: 880, dur: 0.08, a: 0.004, h: 0.05,
        peak: 0.1, ft: 'lowpass', fq: 3400, q: 0.6 });
    },
    /* tick：更短更轻的表针 tick */
    tick: function (t) {
      vo({ t: t, type: 'square', f: 1650, f2: 1400, dur: 0.022, a: 0.001,
        peak: 0.07, ft: 'lowpass', fq: 4500, q: 0.6 });
    },
    /* count：880Hz 短哔 3 连（倒计时） */
    count: function (t) {
      for (var i = 0; i < 3; i++) {
        vo({ t: t + i * 0.18, type: 'square', f: 880, dur: 0.09, a: 0.003,
          h: 0.055, peak: 0.12, ft: 'lowpass', fq: 3600, q: 0.6 });
      }
    },
    /* go：1320Hz 长高哔（起步），叠低五度加厚 */
    go: function (t) {
      vo({ t: t, type: 'square', f: 1320, dur: 0.5, a: 0.004, h: 0.4,
        peak: 0.13, ft: 'lowpass', fq: 4200, q: 0.6 });
      vo({ t: t, type: 'square', f: 880, dur: 0.5, a: 0.006, h: 0.38,
        peak: 0.055, ft: 'lowpass', fq: 3000, q: 0.6 });
    },
    /* bump：低频 thud + 噪声（顶到对手） */
    bump: function (t) {
      vo({ t: t, type: 'sine', f: 110, f2: 42, dur: 0.2, a: 0.003, peak: 0.5 });
      nz({ t: t, dur: 0.12, peak: 0.22, ft: 'lowpass', f: 900, f2: 180, q: 0.7 });
      nz({ t: t, dur: 0.02, peak: 0.1, ft: 'highpass', f: 3500, q: 0.7 });
    },
    /* barrel：撞橙桶闷响（比 bump 更钝、无高频） */
    barrel: function (t) {
      vo({ t: t, type: 'sine', f: 85, f2: 38, dur: 0.26, a: 0.004, peak: 0.45 });
      nz({ t: t, dur: 0.1, peak: 0.14, ft: 'lowpass', f: 380, f2: 120, q: 0.6 });
    },
    /* nitro：白噪 sweep 起 whoosh（持续音由引擎 wind 层接管） */
    nitro: function (t) {
      nz({ t: t, dur: 0.4, a: 0.02, peak: 0.2, ft: 'bandpass', f: 400, f2: 3800, q: 1.1 });
      vo({ t: t, type: 'sawtooth', f: 180, f2: 640, dur: 0.35, a: 0.02,
        peak: 0.06, ft: 'bandpass', fq: 500, fq2: 1800, q: 1.6 });
    },
    /* checkpoint：上行双音阶（660 -> 990 + 高频 sparkle） */
    checkpoint: function (t) {
      vo({ t: t, type: 'square', f: 660, dur: 0.1, a: 0.003, h: 0.06,
        peak: 0.11, ft: 'lowpass', fq: 3600, q: 0.6 });
      vo({ t: t + 0.11, type: 'square', f: 990, dur: 0.22, a: 0.003, h: 0.12,
        peak: 0.12, ft: 'lowpass', fq: 4000, q: 0.6 });
      nz({ t: t + 0.11, dur: 0.12, peak: 0.04, ft: 'highpass', f: 6000, q: 0.7 });
    },
    /* stage：号角短句（C5-G5-C6 双锯齿微失谐） */
    stage: function (t) {
      var seq = [[523.25, 0, 0.14], [783.99, 0.17, 0.14], [1046.5, 0.34, 0.42]];
      for (var i = 0; i < seq.length; i++) {
        vo({ t: t + seq[i][1], type: 'sawtooth', f: seq[i][0], dur: seq[i][2],
          a: 0.006, h: seq[i][2] * 0.6, peak: 0.1, ft: 'lowpass', fq: 1900, q: 0.7, det: 5 });
        vo({ t: t + seq[i][1], type: 'sawtooth', f: seq[i][0], dur: seq[i][2],
          a: 0.006, h: seq[i][2] * 0.6, peak: 0.07, ft: 'lowpass', fq: 1900, q: 0.7, det: -5 });
      }
    },
    /* finish：胜利琶音（C 大调上行两八度 + 尾音高八度闪光） */
    finish: function (t) {
      var seq = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98, 2093];
      for (var i = 0; i < seq.length; i++) {
        var last = i === seq.length - 1;
        vo({ t: t + i * 0.09, type: 'triangle', f: seq[i], dur: last ? 0.7 : 0.14,
          a: 0.004, h: last ? 0.5 : 0.08, peak: 0.11 + i * 0.004 });
        if (i >= 2 && !last) {
          vo({ t: t + i * 0.09, type: 'square', f: seq[i] * 2, dur: 0.1, a: 0.003,
            peak: 0.03, ft: 'lowpass', fq: 5000, q: 0.6 });
        }
      }
      vo({ t: t + 0.63, type: 'square', f: 2637, dur: 0.5, a: 0.01,
        peak: 0.03, ft: 'lowpass', fq: 6000, q: 0.6 });
    },
    /* gameover：下行四音叹息 + 低音收尾 */
    gameover: function (t) {
      var seq = [659.25, 523.25, 440, 349.23];
      for (var i = 0; i < seq.length; i++) {
        var last = i === seq.length - 1;
        vo({ t: t + i * 0.22, type: 'square', f: seq[i], dur: last ? 0.6 : 0.2,
          a: 0.005, h: last ? 0.4 : 0.14, peak: 0.1, ft: 'lowpass', fq: 2400, q: 0.6 });
      }
      vo({ t: t + 0.66, type: 'triangle', f: 174.61, dur: 0.7, a: 0.02, peak: 0.08 });
    },
    /* timeup：880-660-440 下行三连 */
    timeup: function (t) {
      var seq = [880, 660, 440];
      for (var i = 0; i < seq.length; i++) {
        vo({ t: t + i * 0.19, type: 'square', f: seq[i], dur: 0.17, a: 0.003,
          h: 0.12, peak: 0.12, ft: 'lowpass', fq: 3200, q: 0.7 });
      }
    }
  };

  /* 未知名安全回落：极轻中性 tick，不抛错 */
  function generic(t) {
    vo({ t: t, type: 'square', f: 980, f2: 760, dur: 0.03, a: 0.002,
      peak: 0.06, ft: 'lowpass', fq: 3000, q: 0.6 });
  }

  /* ================= 引擎声（常驻节点，只动参数） =================
   * 锯齿主音 + 方波低八度 -> 各自配重 -> lowpass -> engGain -> sfxBus
   * LFO(正弦) -> lfoG -> 两振荡器 frequency（气缸抖动）
   * 风噪: loop 白噪 -> bandpass(950Hz) -> windGain -> sfxBus（nitro 渐入） */
  var eng = { on: false, saw: null, sq: null, lfo: null, wind: null,
    fSaw: null, fSq: null, lp: null, g: null, lfoG: null, windF: null, windG: null };

  function teardownEngNodes(e) {
    var i, ns = [e.saw, e.sq, e.lfo, e.wind];
    for (i = 0; i < ns.length; i++) {
      try { if (ns[i]) ns[i].stop(0); } catch (err) {}
    }
    var all = ns.concat([e.fSaw, e.fSq, e.lp, e.g, e.lfoG, e.windF, e.windG]);
    for (i = 0; i < all.length; i++) {
      try { if (all[i]) all[i].disconnect(); } catch (err) {}
    }
  }

  function engineStart() {
    if (!ensure() || !sfxBus || eng.on) return;
    resumeCtx();
    var e = { on: true, saw: null, sq: null, lfo: null, wind: null,
      fSaw: null, fSq: null, lp: null, g: null, lfoG: null, windF: null, windG: null };
    try {
      e.saw = ctx.createOscillator(); e.saw.type = 'sawtooth';
      e.sq = ctx.createOscillator(); e.sq.type = 'square';
      e.fSaw = ctx.createGain(); e.fSaw.gain.value = 0.5;
      e.fSq = ctx.createGain(); e.fSq.gain.value = 0.34;
      e.lp = ctx.createBiquadFilter(); e.lp.type = 'lowpass';
      e.lp.Q.value = 0.9; e.lp.frequency.value = 320;
      e.g = ctx.createGain(); e.g.gain.value = 0.0001;
      e.lfo = ctx.createOscillator(); e.lfo.type = 'sine'; e.lfo.frequency.value = 8;
      e.lfoG = ctx.createGain(); e.lfoG.gain.value = 2.5;
      e.lfo.connect(e.lfoG);
      e.lfoG.connect(e.saw.frequency);
      e.lfoG.connect(e.sq.frequency);
      e.saw.connect(e.fSaw); e.sq.connect(e.fSq);
      e.fSaw.connect(e.lp); e.fSq.connect(e.lp);
      e.lp.connect(e.g); e.g.connect(sfxBus);
      e.wind = ctx.createBufferSource(); e.wind.buffer = noiseBuf; e.wind.loop = true;
      e.windF = ctx.createBiquadFilter(); e.windF.type = 'bandpass';
      e.windF.frequency.value = 950; e.windF.Q.value = 0.6;
      e.windG = ctx.createGain(); e.windG.gain.value = 0.0001;
      e.wind.connect(e.windF); e.windF.connect(e.windG); e.windG.connect(sfxBus);
      e.saw.frequency.value = 55; e.sq.frequency.value = 27.5;
      var t = ctx.currentTime;
      e.saw.start(t); e.sq.start(t); e.lfo.start(t); e.wind.start(t);
      e.g.gain.setTargetAtTime(0.16, t, 0.12);   // 怠速渐入
      eng = e;
    } catch (err) {
      e.on = false;
      teardownEngNodes(e);
    }
  }

  /* 每帧调用：只 setTargetAtTime，绝不创建节点，绝不 zipper */
  function engineUpdate(speed01, nitroOn) {
    if (!eng.on || !ctx) return;
    var s = clamp(+speed01 || 0, 0, 1);
    var nitro = !!nitroOn;
    var t = ctx.currentTime;
    var f = 55 + s * 165;                          // 55..220 Hz
    if (nitro) f *= 1.12;
    var fc = 300 + s * 1500 + (nitro ? 250 : 0);   // 300..1800(+nitro) Hz
    var gv = 0.15 + s * 0.13 + (nitro ? 0.03 : 0);
    try {
      eng.saw.frequency.setTargetAtTime(f, t, 0.06);
      eng.sq.frequency.setTargetAtTime(f * 0.5, t, 0.06);
      eng.lp.frequency.setTargetAtTime(fc, t, 0.07);
      eng.g.gain.setTargetAtTime(gv, t, 0.08);
      eng.lfo.frequency.setTargetAtTime(6 + s * 14, t, 0.1);
      eng.lfoG.gain.setTargetAtTime(2.2 + s * 2.6, t, 0.15);
      eng.windG.gain.setTargetAtTime(nitro ? 0.16 : 0, t, 0.14);
    } catch (err) {}
  }

  function engineStop() {
    if (!eng.on) return;
    eng.on = false;
    var e = eng;
    eng = { on: false, saw: null, sq: null, lfo: null, wind: null,
      fSaw: null, fSq: null, lp: null, g: null, lfoG: null, windF: null, windG: null };
    if (ctx) {
      var t = ctx.currentTime;
      try {
        e.g.gain.cancelScheduledValues(t);
        e.g.gain.setTargetAtTime(0.0001, t, 0.09);
        e.windG.gain.cancelScheduledValues(t);
        e.windG.gain.setTargetAtTime(0.0001, t, 0.09);
      } catch (err) {}
    }
    setTimeout(function () { teardownEngNodes(e); }, 500);
  }

  /* ================= BGM 步进音序器 =================
   * setInterval(25ms) + WebAudio 时钟前瞻 0.15s 调度（照抄 TF 模式）。
   * 内部 16 分音符步进，64 步 = 4 小节循环。 */

  function hat(t, pk) {
    nz(D({ t: t, dur: 0.03, peak: pk, ft: 'highpass', f: 7500, q: 0.7 }));
  }

  /* --- menu：慵懒小调（Am-F-C-G，三角波，轻） ---
   * lead/bass 表：step -> [MIDI, 长度(步)] */
  var MENU_LEAD = {
    0: [64, 3], 3: [67, 2], 6: [69, 5], 12: [64, 2], 14: [62, 2],
    16: [60, 3], 22: [62, 2], 24: [60, 2], 28: [57, 5],
    32: [64, 2], 36: [67, 2], 40: [72, 5], 46: [67, 2],
    48: [62, 3], 54: [64, 2], 56: [62, 2], 60: [59, 4]
  };
  var MENU_BASS = {
    0: [45, 8], 10: [52, 4],
    16: [41, 8], 26: [48, 4],
    32: [48, 8], 42: [55, 4],
    48: [43, 8], 58: [47, 4]
  };
  function menuStep(td, s, t) {
    var st = 60 / td.bpm / 4;
    var m = MENU_LEAD[s];
    if (m) vo(D({ t: t, type: 'triangle', f: mf(m[0]), dur: m[1] * st * 0.95,
      a: 0.012, peak: 0.075 }));
    var b = MENU_BASS[s];
    if (b) vo(D({ t: t, type: 'triangle', f: mf(b[0]), dur: b[1] * st * 0.9,
      a: 0.008, peak: 0.16, ft: 'lowpass', fq: 700, q: 0.5 }));
    if ((s & 15) === 4 || (s & 15) === 12) hat(t, 0.014);
  }

  /* --- race1「sunrise」：132bpm C 大调五声明亮推进 ---
   * 三角 bass 八分泵（低八度过门），方波 lead 明亮钩子，噪声 hat 反拍 */
  var R1_LEAD = {
    0: [76, 2], 2: [79, 2], 4: [84, 4], 8: [79, 2], 10: [81, 2], 12: [79, 3],
    16: [81, 2], 18: [76, 2], 20: [72, 3], 24: [74, 2], 26: [76, 2], 28: [74, 2], 30: [72, 2],
    32: [72, 2], 34: [74, 2], 36: [76, 3], 40: [79, 2], 42: [81, 2], 44: [79, 4],
    48: [74, 2], 50: [76, 2], 52: [79, 3], 56: [81, 2], 58: [79, 2], 60: [76, 2], 62: [74, 2]
  };
  function race1Step(td, s, t) {
    var st = 60 / td.bpm / 4, bar = (s >> 4) & 3, pos = s & 15;
    var roots = [48, 45, 41, 43];   // C3 A2 F2 G2
    if ((pos & 1) === 0) {
      var r = roots[bar] - ((pos === 6 || pos === 14) ? 12 : 0);
      vo(D({ t: t, type: 'triangle', f: mf(r), dur: st * 1.7, a: 0.004,
        peak: (pos & 3) === 0 ? 0.26 : 0.2 }));
    }
    if (pos === 2 || pos === 6 || pos === 10 || pos === 14) hat(t, pos === 14 ? 0.04 : 0.028);
    var m = R1_LEAD[s];
    if (m) vo(D({ t: t, type: 'square', f: mf(m[0]), dur: m[1] * st * 0.9,
      a: 0.006, peak: 0.075, ft: 'lowpass', fq: 2800, q: 0.6, det: (s & 1) ? 3 : -3 }));
  }

  /* --- race2「midnight」：118bpm Em 小调，切分 bass + 暗色 lead --- */
  var R2_LEAD = {
    0: [71, 3], 4: [76, 4], 10: [74, 2], 12: [71, 4],
    16: [67, 3], 20: [69, 2], 24: [71, 3], 28: [69, 2], 30: [67, 2],
    32: [62, 2], 34: [67, 2], 36: [71, 4], 42: [74, 2], 44: [76, 4],
    48: [74, 3], 52: [69, 3], 56: [71, 2], 58: [69, 2], 60: [67, 2], 62: [64, 2]
  };
  function race2Step(td, s, t) {
    var st = 60 / td.bpm / 4, bar = (s >> 4) & 3, pos = s & 15;
    var roots = [40, 36, 43, 38];   // E2 C2 G2 D2
    if (pos === 0 || pos === 3 || pos === 6 || pos === 8 || pos === 11 || pos === 14) {
      var r = roots[bar] + ((pos === 6 || pos === 14) ? 12 : 0);
      vo(D({ t: t, type: 'triangle', f: mf(r), dur: st * 1.6, a: 0.005,
        peak: pos === 0 ? 0.27 : 0.21, ft: 'lowpass', fq: 640, q: 0.5 }));
    }
    if (pos === 2 || pos === 6 || pos === 10 || pos === 14) hat(t, 0.022);
    if (pos === 15) hat(t, 0.012);
    var m = R2_LEAD[s];
    if (m) vo(D({ t: t, type: 'square', f: mf(m[0]), dur: m[1] * st * 0.92,
      a: 0.01, peak: 0.06, ft: 'lowpass', fq: 2000, q: 0.6 }));
  }

  var tracks = {
    menu: { bpm: 88, total: 64, level: 0.9, stepFn: menuStep },
    race1: { bpm: 132, total: 64, level: 1, stepFn: race1Step },
    race2: { bpm: 118, total: 64, level: 1, stepFn: race2Step }
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
  var ALIAS = { sunrise: 'race1', midnight: 'race2' };
  var ovrMap = {};          // 逻辑轨 -> 实际轨（applyOverrides 注入）
  var bgmName = null;
  var AHEAD = 0.15, TICK_MS = 25;

  function bgmTick(td) {
    if (!td.on || !ctx) return;
    CURTD = td;
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
      g.exponentialRampToValueAtTime(0.0001, t + 0.5);
    } catch (e) {}
    setTimeout(function () { killLive(td.live); }, 600);
  }

  function resolveTrack(id) {
    id = ALIAS[id] || id;
    if (ovrMap[id]) id = ovrMap[id];
    return tracks[id] ? id : null;
  }

  function bgm(id) {
    if (!ensure()) return;
    var name = resolveTrack(id);
    if (!name) return;                       // 未知轨安全回落
    var td = tracks[name];
    resumeCtx();
    if (bgmName === name && td.on) return;   // 同轨幂等
    if (bgmName && tracks[bgmName] && tracks[bgmName].on &&
        tracks[bgmName] !== td) fadeOut(tracks[bgmName]);
    bgmName = name;
    td.on = true; td.step = 0; td.next = ctx.currentTime + 0.06;
    try {
      var g = td.gain.gain, t = ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(0.0001, g.value), t);
      g.exponentialRampToValueAtTime(td.level, t + 0.5);   // 切轨平滑 ramp
    } catch (e) {}
    if (td.timer) clearInterval(td.timer);
    td.timer = setInterval(function () { bgmTick(td); }, TICK_MS);
    bgmTick(td);
  }

  function bgmStop() {
    if (bgmName && tracks[bgmName]) {
      var td = tracks[bgmName];
      if (ctx && td.on) fadeOut(td);
      else { td.on = false; if (td.timer) { clearInterval(td.timer); td.timer = null; } }
    }
    bgmName = null;
  }

  /* ================= overrides =================
   * applyOverrides({bgm:'sunrise'|'midnight'|'menu'|'race1'|'race2'})
   *   -> 指定菜单 BGM 曲目（设置面板 menu 曲×2）；
   * 也支持 {menu:..|race1:..|race2:..} 任意逻辑轨换绑；falsy 值复位该键。 */
  function applyOverrides(map) {
    if (!map || typeof map !== 'object') return;
    for (var key in map) {
      if (!Object.prototype.hasOwnProperty.call(map, key)) continue;
      var logical = key === 'bgm' ? 'menu' : key;
      if (logical !== 'menu' && logical !== 'race1' && logical !== 'race2') continue;
      var v = map[key];
      if (!v) { delete ovrMap[logical]; continue; }
      var actual = ALIAS[v] || v;
      if (tracks[actual]) ovrMap[logical] = actual;
    }
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
      master.gain.value = muted ? 0.0001 : vMaster;
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 8;
      comp.attack.value = 0.002; comp.release.value = 0.15;
      master.connect(comp); comp.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.gain.value = vSfx; sfxBus.connect(master);
      bgmMix = ctx.createGain(); bgmMix.gain.value = 0.3;
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
    return true;
  }

  function resumeCtx() {
    if (!ctx || ctx.state !== 'suspended' || !ctx.resume) return;
    try {
      var p = ctx.resume();
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }

  /* 页面隐藏：停 BGM（清调度器）+ 停引擎；恢复不自动续（由 main 控制） */
  function onVis() {
    if (!ctx) return;
    if (document.hidden) {
      bgmStop();
      engineStop();
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

  /* ---------------- 对外接口 ---------------- */
  function init() { ensure(); }            // 幂等

  function unlock() {                      // iOS 首手势 resume，幂等
    if (!ensure()) return;
    resumeCtx();
  }

  function play(name) {
    if (!ensure()) return;
    try {
      var t0 = ctx.currentTime + 0.02;
      if (ctx.state === 'suspended') resumeCtx();
      var c = cues[name];
      if (c) c(t0);
      else generic(t0);                    // 未知名安全回落
    } catch (e) {}
  }

  /* 三层音量相乘：master × (bgm|sfx)，cfg.sound 注入 */
  function setVolumes(o) {
    if (!o || typeof o !== 'object') return;
    if (o.master != null && isFinite(+o.master)) vMaster = clamp(+o.master, 0, 1);
    if (o.bgm != null && isFinite(+o.bgm)) vBgm = clamp(+o.bgm, 0, 1);
    if (o.sfx != null && isFinite(+o.sfx)) vSfx = clamp(+o.sfx, 0, 1);
    if (!ctx) return;
    try {
      var t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setTargetAtTime(muted ? 0.0001 : vMaster, t, 0.02);
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
      master.gain.setTargetAtTime(muted ? 0.0001 : vMaster, t, 0.015);
    } catch (e) {
      try { master.gain.value = muted ? 0.0001 : vMaster; } catch (e2) {}
    }
  }

  /* 碰撞时压低 BGM：quick dip -> hold -> 0.25s 恢复 */
  function duck(ms, depth) {
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

  return {
    init: init,
    unlock: unlock,
    play: play,
    setVolumes: setVolumes,
    setMuted: setMuted,
    engineStart: engineStart,
    engineUpdate: engineUpdate,
    engineStop: engineStop,
    bgm: bgm,
    bgmStop: bgmStop,
    duck: duck,
    applyOverrides: applyOverrides,
    names: NAMES,
    trackIds: ['menu', 'race1', 'race2']
  };
})();
