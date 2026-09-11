/* ============================================================
 * FIERY DRAGON 火龙珠 · SFX 子代理B — WebAudio 程序化合成音效引擎
 * 纯合成 8-bit 街机风：方波/三角波/锯齿/白噪声 + 快速包络。
 * 链路: voice → master → (dry) → compressor → destination
 *                     └→ convolver(程序生成衰减噪声IR) → wet → compressor
 * 无任何外部音频资源；无 AudioContext 环境全程安全降级不抛错。
 * ============================================================ */
window.SFX = (() => {
  'use strict';

  var MASTER_VOL = 0.8;
  var ctx = null;          // AudioContext
  var master = null;       // 总增益（静音控制点）
  var comp = null;         // 轻限幅，防止 win3 多层叠爆
  var conv = null;         // 混响
  var wet = null;          // 湿声增益
  var noiseBuf = null;     // 缓存的 1s 白噪声
  var muted = false;
  var loops = {};          // 循环型句柄: gspin / bgm

  /* ---------------- 基础设施 ---------------- */

  function resume() {
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      try {
        var p = ctx.resume();
        if (p && p.catch) p.catch(function () {});
      } catch (e) {}
    }
  }

  // 程序生成混响 IR：双声道衰减噪声
  function makeIR(seconds, decay) {
    var rate = ctx.sampleRate;
    var len = Math.max(1, Math.floor(seconds * rate));
    var buf = ctx.createBuffer(2, len, rate);
    for (var c = 0; c < 2; c++) {
      var d = buf.getChannelData(c);
      for (var i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  // 幂等初始化；iOS 需在首次用户手势中调用
  function init() {
    if (ctx) { resume(); return; }
    var AC = (typeof window !== 'undefined') &&
             (window.AudioContext || window.webkitAudioContext);
    if (!AC) return;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : MASTER_VOL;
      comp = ctx.createDynamicsCompressor();
      try {
        comp.threshold.value = -14; comp.knee.value = 20; comp.ratio.value = 6;
      } catch (e) {}
      comp.connect(ctx.destination);
      master.connect(comp);                                    // 干声
      conv = ctx.createConvolver();
      conv.buffer = makeIR(1.1, 2.8);
      wet = ctx.createGain();
      wet.gain.value = 0.13;
      master.connect(conv); conv.connect(wet); wet.connect(comp); // 湿声并行
      resume();
      preloadSamples();                                      // 预载本地采样
    } catch (e) {
      ctx = null; master = null; comp = null; conv = null; wet = null;
    }
  }

  function noise() {
    if (!noiseBuf) {
      var rate = ctx.sampleRate;
      noiseBuf = ctx.createBuffer(1, rate, rate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  /* 单音: 方波/三角/锯齿 + 快速 AD 包络 (+可选颤音)，自清理 */
  function beep(o) {
    var t0 = (o.t != null) ? o.t : ctx.currentTime;
    var dur = o.dur || 0.1;
    var vol = Math.max(0.0003, o.vol || 0.15);
    var osc = ctx.createOscillator();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(Math.max(1, o.f0), t0);
    if (o.f1 && o.f1 !== o.f0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t0 + dur);
    }
    var g = ctx.createGain();
    var a = Math.min(o.attack != null ? o.attack : 0.004, dur * 0.5);
    g.gain.setValueAtTime(0.0002, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0002, t0 + dur);
    osc.connect(g); g.connect(master);
    var lfo = null, lg = null;
    if (o.vib) {                       // vib: [Hz, depth]
      lfo = ctx.createOscillator();
      lfo.frequency.value = o.vib[0];
      lg = ctx.createGain();
      lg.gain.value = o.vib[1];
      lfo.connect(lg); lg.connect(osc.frequency);
      lfo.start(t0);
    }
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
    osc.onended = function () {
      try {
        g.disconnect(); osc.disconnect();
        if (lfo) { try { lfo.stop(); } catch (e) {} lfo.disconnect(); lg.disconnect(); }
      } catch (e) {}
    };
  }

  /* 噪声打击: 可选带通/高通/低通 + 频率扫掠，自清理 */
  function nz(o) {
    var t0 = (o.t != null) ? o.t : ctx.currentTime;
    var dur = o.dur || 0.1;
    var vol = Math.max(0.0003, o.vol || 0.15);
    var src = ctx.createBufferSource();
    src.buffer = noise(); src.loop = true;
    var f = ctx.createBiquadFilter();
    f.type = o.ftype || 'bandpass';
    f.frequency.setValueAtTime(Math.max(20, o.f0 || 2000), t0);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + dur);
    f.Q.value = o.q || 1;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0002, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0002, t0 + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.02);
    src.onended = function () {
      try { g.disconnect(); f.disconnect(); src.disconnect(); } catch (e) {}
    };
  }

  /* ---------------- 一次性音效（8-bit 音色设计） ---------------- */

  var SOUNDS = {
    // 投币：两声高频金属叮 + 下滑落袋
    coin: function () {
      var t = ctx.currentTime;
      beep({ f0: 1976, dur: 0.07, vol: 0.2, t: t });
      beep({ f0: 2637, dur: 0.09, vol: 0.18, t: t + 0.07 });
      beep({ f0: 1200, f1: 320, dur: 0.12, vol: 0.1, t: t + 0.16 });
    },
    // 押注：短促方波嘟
    bet: function () {
      beep({ f0: 660, f1: 520, dur: 0.07, vol: 0.2 });
    },
    // 全押：快速上行扫弦琶音
    allin: function () {
      var t = ctx.currentTime;
      var sc = [523, 587, 659, 784, 880, 1046, 1175, 1319];
      for (var i = 0; i < sc.length; i++) {
        beep({ f0: sc[i], dur: 0.1, vol: 0.12, t: t + i * 0.035 });
      }
    },
    // 启动：噪声嗖(高通下扫) + 低频引擎起转
    go: function () {
      var t = ctx.currentTime;
      nz({ ftype: 'highpass', f0: 3200, f1: 300, dur: 0.35, vol: 0.16, q: 0.8, t: t });
      beep({ type: 'sawtooth', f0: 45, f1: 130, dur: 0.7, vol: 0.2, t: t + 0.05, attack: 0.08 });
      beep({ f0: 220, dur: 0.08, vol: 0.12, t: t + 0.72 });
    },
    // 跑灯哒：极短单方波，pitch 0.6~1.6 缩放基频，可高频重叠
    tick: function (opts) {
      var p = (opts && opts.pitch) ? opts.pitch : 1;
      beep({ f0: 900 * p, dur: 0.03, vol: 0.09, attack: 0.001 });
    },
    // LUCK：神秘上行五声音阶琶音 + 尾音闪烁颤音
    luck: function () {
      var t = ctx.currentTime;
      var sc = [523, 587, 659, 784, 880, 1046];
      for (var i = 0; i < sc.length; i++) {
        beep({ f0: sc[i], dur: 0.11, vol: 0.13, t: t + i * 0.07 });
        beep({ type: 'triangle', f0: sc[i] * 2, dur: 0.08, vol: 0.04, t: t + i * 0.07 });
      }
      beep({ f0: 1319, dur: 0.5, vol: 0.14, t: t + 0.44, vib: [9, 18] });
      beep({ type: 'triangle', f0: 2637, dur: 0.4, vol: 0.05, t: t + 0.44, vib: [9, 30] });
    },
    // 小奖 0.5s：三连上行 + 高八度收尾
    win0: function () {
      var t = ctx.currentTime;
      var n = [523, 659, 784];
      for (var i = 0; i < n.length; i++) beep({ f0: n[i], dur: 0.1, vol: 0.17, t: t + i * 0.07 });
      beep({ f0: 1046, dur: 0.22, vol: 0.2, t: t + 0.22 });
    },
    // 中奖 1.2s：上行琶音 + 和弦垫 + 星光
    win1: function () {
      var t = ctx.currentTime;
      var arp = [523, 659, 784, 1046];
      for (var i = 0; i < arp.length; i++) beep({ f0: arp[i], dur: 0.1, vol: 0.18, t: t + i * 0.08 });
      var pad = [523, 659, 784, 1046];
      for (var j = 0; j < pad.length; j++) {
        beep({ type: 'triangle', f0: pad[j], dur: 0.7, vol: 0.055, t: t + 0.35, attack: 0.03 });
      }
      beep({ f0: 2637, dur: 0.2, vol: 0.06, t: t + 0.62 });
    },
    // 大奖 2.5s：双八度琶音 + 双和弦垫 + 高音铃
    win2: function () {
      var t = ctx.currentTime;
      var arp = [523, 659, 784, 1046, 1319, 1568, 2093];
      for (var i = 0; i < arp.length; i++) beep({ f0: arp[i], dur: 0.1, vol: 0.16, t: t + i * 0.09 });
      var c = [523, 659, 784, 1046];
      for (var a = 0; a < c.length; a++) beep({ type: 'triangle', f0: c[a], dur: 1.0, vol: 0.055, t: t + 0.7, attack: 0.04 });
      var gch = [392, 494, 587, 784];
      for (var b = 0; b < gch.length; b++) beep({ type: 'triangle', f0: gch[b], dur: 0.7, vol: 0.055, t: t + 1.5, attack: 0.04 });
      beep({ f0: 2093, dur: 0.3, vol: 0.07, t: t + 1.2 });
      beep({ f0: 2637, dur: 0.3, vol: 0.07, t: t + 1.55 });
      var fin = [523, 659, 784, 1046];
      for (var k = 0; k < fin.length; k++) beep({ type: 'triangle', f0: fin[k], dur: 0.5, vol: 0.06, t: t + 2.0 });
      beep({ f0: 2093, dur: 0.45, vol: 0.12, t: t + 2.0 });
    },
    // JACKPOT 4s：大琶音+进行和弦垫+高音铃+烟花爆裂
    win3: function () {
      var t = ctx.currentTime;
      var arp = [523, 659, 784, 1046, 1319, 1568, 2093, 2637];
      for (var i = 0; i < arp.length; i++) beep({ f0: arp[i], dur: 0.11, vol: 0.16, t: t + i * 0.1 });
      var pads = [
        [523, 659, 784, 1046, 0.9, 1.2],
        [349, 440, 523, 698, 1.7, 0.8],
        [392, 494, 587, 784, 2.3, 0.8],
        [523, 659, 784, 1046, 2.9, 1.1]
      ];
      for (var p = 0; p < pads.length; p++) {
        for (var m = 0; m < 4; m++) {
          beep({ type: 'triangle', f0: pads[p][m], dur: pads[p][5], vol: 0.05, t: t + pads[p][4], attack: 0.05 });
        }
      }
      var bells = [[2093, 1.0], [2637, 1.35], [3136, 1.7], [2093, 2.6], [3136, 3.1]];
      for (var bl = 0; bl < bells.length; bl++) {
        beep({ f0: bells[bl][0], dur: 0.3, vol: 0.07, t: t + bells[bl][1] });
      }
      var booms = [1.3, 2.0, 2.7, 3.3];    // 烟花：带通爆裂 + 低频闷响
      for (var f = 0; f < booms.length; f++) {
        nz({
          ftype: 'bandpass', f0: 1200 + Math.random() * 3000,
          f1: 200, dur: 0.28, vol: 0.2, q: 0.7, t: t + booms[f]
        });
        beep({ type: 'sawtooth', f0: 100, f1: 40, dur: 0.15, vol: 0.16, t: t + booms[f] });
      }
    },
    // 比倍猜对：双音叮咚上行
    gwin: function () {
      var t = ctx.currentTime;
      beep({ f0: 659, dur: 0.09, vol: 0.18, t: t });
      beep({ f0: 880, dur: 0.28, vol: 0.18, t: t + 0.1, vib: [7, 6] });
    },
    // 猜错：低频下滑呜
    glose: function () {
      var t = ctx.currentTime;
      beep({ type: 'sawtooth', f0: 220, f1: 70, dur: 0.55, vol: 0.18, t: t });
      beep({ f0: 110, f1: 50, dur: 0.55, vol: 0.1, t: t });
    },
    // 收分：金币快速流入串（上行叮叮）+ 落袋滑音
    insert: function () {
      var t = ctx.currentTime;
      var fs = [1568, 1760, 1976, 2093, 2349, 2637];
      for (var i = 0; i < fs.length; i++) beep({ f0: fs[i], dur: 0.05, vol: 0.13, t: t + i * 0.055 });
      beep({ f0: 3136, dur: 0.16, vol: 0.15, t: t + 0.34 });
      beep({ f0: 1000, f1: 380, dur: 0.12, vol: 0.09, t: t + 0.46 });
    },
    // 通用按键：短咔
    press: function () {
      beep({ f0: 1200, dur: 0.025, vol: 0.09, attack: 0.001 });
      nz({ ftype: 'highpass', f0: 5000, dur: 0.02, vol: 0.04 });
    }
  };

  /* ---------------- 循环型：比倍轮盘 gspin ---------------- */

  function startGspin(opts) {
    init();
    if (!ctx) return null;
    if (loops.gspin) return loops.gspin;
    var t0 = ctx.currentTime;
    var pm = (opts && opts.pitch) ? opts.pitch : 1;
    var h = {
      stop: function () {
        if (h.timer) { clearInterval(h.timer); h.timer = null; }
        if (loops.gspin === h) delete loops.gspin;
      }
    };
    h.timer = setInterval(function () {
      if (!ctx) return;
      var e = ctx.currentTime - t0;
      var rise = Math.min(1, e / 3);          // 3s 内渐升，营造加速感
      beep({ f0: (700 + 400 * rise) * pm, dur: 0.035, vol: 0.085, attack: 0.001 });
    }, 66);
    loops.gspin = h;
    return h;
  }

  /* ---------------- BGM：轻量 8-bit 循环 (bpm 132, Am-F-C-G) ----------------
   * 低音方波 8 分 + 三角波琶音 16 分 + 极轻噪声 hat，整体音量压低不喧宾。
   * lookahead 调度器: setInterval(40ms) + 0.18s 提前排程。
   */
  var BGM = [
    { bass: 110.0,  notes: [220.0, 261.63, 329.63, 440.0] },   // Am
    { bass: 87.31,  notes: [174.61, 220.0, 261.63, 349.23] },  // F
    { bass: 130.81, notes: [261.63, 329.63, 392.0, 523.25] },  // C
    { bass: 98.0,   notes: [196.0, 246.94, 293.66, 392.0] }    // G
  ];
  var ARP_SEQ = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 3, 2, 1];
  var bgm = null;

  function startSynthBGM() {
    init();
    if (!ctx || bgm) return;
    var STEP = 60 / 132 / 4;                 // 16分音符 ≈ 0.1136s
    var st = { step: 0, next: ctx.currentTime + 0.06, timer: null };
    function schedule() {
      while (st.next < ctx.currentTime + 0.18) {
        var bar = Math.floor(st.step / 16) % 4;
        var pos = st.step % 16;
        var ch = BGM[bar];
        if (pos % 2 === 0) {                 // 低音 8 分，第 3 拍翻高八度
          beep({
            f0: ch.bass * (pos === 4 || pos === 12 ? 2 : 1),
            t: st.next, dur: 0.11, vol: 0.11, attack: 0.003
          });
        }
        beep({                                 // 琶音 16 分
          type: 'triangle', f0: ch.notes[ARP_SEQ[pos]],
          t: st.next, dur: 0.085, vol: 0.05
        });
        if (pos % 4 === 2) {                   // 轻 hat
          nz({ ftype: 'highpass', f0: 6000, dur: 0.03, vol: 0.016, t: st.next });
        }
        st.next += STEP;
        st.step++;
      }
    }
    st.timer = setInterval(schedule, 40);
    schedule();
    bgm = st;
    loops.bgm = { stop: stopBGM };
  }

  function stopBGM() {
    bgmPending = false;
    if (bgmSrc) {
      try { bgmSrc.stop(); } catch (e) {}
      try { bgmSrc.disconnect(); } catch (e2) {}
      bgmSrc = null;
    }
    if (bgm) {
      clearInterval(bgm.timer);
      bgm = null;
    }
    delete loops.bgm;
  }

  var bgmPending = false;
  function startBGM() {
    init();
    if (bgmSrc || (bgm && bgm.timer)) return;
    if (ctx && bgmBuffer) {                  // 本地循环优先
      try {
        bgmSrc = ctx.createBufferSource();
        bgmSrc.buffer = bgmBuffer;
        bgmSrc.loop = true;
        var g = ctx.createGain();
        g.gain.value = 0.55;
        bgmSrc.connect(g); g.connect(master);
        bgmSrc.start();
        loops.bgm = { stop: stopBGM };
        return;
      } catch (e) { bgmSrc = null; }
    }
    bgmPending = true;                       // 缓冲未就绪，就绪后自动起播
    startSynthBGM();
  }

  /* ---------------- 本地采样音效层（Mixkit 免费授权，合成兜底） ---------------- */

  var FILES = {
    win0:   'assets/sfx/sfx_1936.mp3',   // Magical coin win（小奖）
    win1:   'assets/sfx/sfx_1928.mp3',   // Slot machine win
    win2:   'assets/sfx/sfx_1934.mp3',   // Payout award
    win3:   'assets/sfx/sfx_1929.mp3',   // Win siren（大奖/头奖警报）
    gwin:   'assets/sfx/sfx_1938.mp3',   // Melodic bonus collect（比倍赢）
    glose:  'assets/sfx/sfx_1937.mp3',   // Bonus collect award（比倍输，短促低沉）
    coin:   'assets/sfx/sfx_1939.mp3',   // Coins handling（投币）
    insert: 'assets/sfx/sfx_1935.mp3',   // Payout award ding（收分）
    go:     'assets/sfx/sfx_1933.mp3'    // Arcade slot machine wheel（开局）
  };
  var buffers = {};        // name → AudioBuffer（预加载）
  var bgmBuffer = null;
  var bgmSrc = null;

  function decode(url, cb) {
    if (!ctx) return;
    fetch(url).then(function (r) { return r.ok ? r.arrayBuffer() : Promise.reject(r.status); })
      .then(function (ab) { ctx.decodeAudioData(ab, function (buf) { cb(buf); }, function () {}); })
      .catch(function () {});
  }
  function preloadSamples() {
    if (!ctx) return;
    Object.keys(FILES).forEach(function (name) {
      if (buffers[name]) return;
      decode(FILES[name], function (buf) { buffers[name] = buf; });
    });
    if (!bgmBuffer) {
      decode('assets/bgm/bgm_loop.mp3', function (buf) {
        bgmBuffer = buf;
        if (bgmPending) { bgmPending = false; startBGM(); }
      });
    }
  }

  function playBuffer(buf, vol) {
    if (!buf || !ctx) return;
    try {
      var src = ctx.createBufferSource();
      src.buffer = buf;
      var g = ctx.createGain();
      g.gain.value = vol == null ? 1 : vol;
      src.connect(g); g.connect(master);
      src.start();
    } catch (e) {}
  }

  /* ---------------- 对外 API ---------------- */

  function play(name, opts) {
    init();
    if (!ctx) return null;
    if (name === 'gspin') return startGspin(opts);
    // 真实采样优先（tick/gspin/allin/bet/luck/press 等高频/风格化音保持合成）
    if (buffers[name] && name !== 'tick') {
      playBuffer(buffers[name], name === 'win3' || name === 'win2' ? 0.95 : 0.85);
      return null;
    }
    var fn = SOUNDS[name];
    if (!fn) return null;                    // 未知音效：静默忽略
    try { fn(opts || {}); } catch (e) {}
    return null;
  }

  function stop(name) {
    if (name === 'bgm') { stopBGM(); return; }
    var h = loops[name];
    if (h) { try { h.stop(); } catch (e) {} delete loops[name]; }
  }

  function setMuted(b) {
    muted = !!b;
    if (ctx && master) {
      try {
        master.gain.setTargetAtTime(muted ? 0 : MASTER_VOL, ctx.currentTime, 0.02);
      } catch (e) {
        try { master.gain.value = muted ? 0 : MASTER_VOL; } catch (e2) {}
      }
    }
  }

  return {
    init: init,
    play: play,
    stop: stop,
    setMuted: setMuted,
    toggleMuted: function () { setMuted(!muted); return muted; },
    isMuted: function () { return muted; },
    startBGM: startBGM,
    stopBGM: stopBGM
  };
})();
