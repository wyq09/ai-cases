/* ============================================================
 * 鼠族跑酷 · MOUSE RUSH —— src/audio.js（子代理 D · 音频）
 * WebAudio 全程序化合成：26 个音效 cue + 5 轨 BGM，零外部音频资源。
 *
 * 音频链: (sfxBus | bgmOut) -> master(总静音) -> DynamicsCompressor -> destination
 *   sfxBus.gain = 用户SFX音量 × SFX静音开关
 *   bgmOut.gain = 0.22 × 用户BGM音量 × BGM静音开关（BGM 基准 0.22）
 * BGM 调度: lookahead（每 25ms 检查一次，提前 0.15s 排程），切轨用增益淡入淡出。
 * 惰性: init() 只挂事件监听，AudioContext 到第一次真正发声（unlock/play/startBGM）才创建。
 * ============================================================ */
window.MP = window.MP || {};
MP.SFX = (() => {
  'use strict';

  /* ---------------- 内部状态 ---------------- */
  let ctx = null;         // AudioContext（惰性创建）
  let master = null;      // 总增益：总静音在这里
  let comp = null;        // DynamicsCompressor：多音叠加不削波
  let sfxBus = null;      // SFX 支路（用户 SFX 音量 / SFX 静音）
  let bgmOut = null;      // BGM 支路（0.22 基准 × 用户 BGM 音量 / BGM 静音）
  let noiseBuf = null;    // 共享 1s 白噪声
  let mutedAll = false;   // 总静音
  let muteBgm = false;    // BGM 独立静音
  let muteSfx = false;    // SFX 独立静音
  let volBgm = 0.7;       // 用户 BGM 音量 0~1
  let volSfx = 0.85;      // 用户 SFX 音量 0~1
  let bound = false;      // 事件监听只挂一次
  let bgmName = null;     // 当前 BGM 轨名
  const CUR = { rate: 1, vol: 1 }; // play(opts) 注入，voice 统一应用
  let CURTD = null;       // BGM 调度时的当前轨（voice 默认走向它的 gain）

  const BGM_BASE = 0.22;  // BGM master gain 基准（契约 §2.4）
  const AHEAD = 0.15;     // lookahead 排程提前量（秒）
  const TICK_MS = 25;     // lookahead 检查间隔（毫秒）

  /* 全部 cue 名（契约 §2.4 固定名，顺序与契约一致） */
  const NAMES = [
    'ui', 'jump', 'djump', 'land', 'slide', 'dash', 'hurt', 'die',
    'coin', 'cheese', 'gem', 'pickup', 'powerup', 'stomp', 'kill',
    'explode', 'freeze', 'emp', 'mega', 'combo', 'style', 'star',
    'clock', 'checkpoint', 'clear', 'gameover'
  ];

  /* ---------------- 小工具 ---------------- */
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function mf(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  /* 节点用完 stop -> onended -> 全员 disconnect，防泄漏 */
  function track(src, nodes, live) {
    if (live) live.push(src);
    src.onended = function () {
      if (live) {
        const i = live.indexOf(src);
        if (i >= 0) live.splice(i, 1);
      }
      for (let j = 0; j < nodes.length; j++) {
        try { nodes[j].disconnect(); } catch (e) {}
      }
      src.onended = null;
    };
  }

  function killLive(arr) {
    const a = arr.splice(0, arr.length);
    for (let i = 0; i < a.length; i++) {
      try { a[i].stop(0); } catch (e) {}
    }
  }

  /* BGM voice 默认走向当前轨的 gain */
  function D(o) {
    if (CURTD) {
      if (!o.dest) o.dest = CURTD.gain;
      if (!o.live) o.live = CURTD.live;
    }
    return o;
  }

  /* ---------------- 基础 voice ----------------
   * vo: 振荡器（可带低通/带通/滑频/失谐/颤音/保持段）
   * CUR.rate 缩放音高与时长，CUR.vol 缩放峰值 —— 全 cue 支持 rate/vol */
  function vo(o) {
    if (!ctx) return null;
    const R = CUR.rate, V = CUR.vol;
    let osc = null, g = null, fl = null, started = false;
    try {
      const t0 = o.t;
      const dest = o.dest || (CURTD ? CURTD.gain : sfxBus);
      const dur = Math.max(0.008, (o.dur || 0.1) / R);
      const f0 = Math.max(1, (o.f || 440) * R);
      osc = ctx.createOscillator();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(f0, t0);
      if (o.f2) {
        const slide = Math.min(dur, o.slide != null ? o.slide / R : dur);
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2 * R), t0 + slide);
      }
      if (o.det) { try { osc.detune.value = o.det; } catch (e) {} }
      if (o.vib) {                       // 颤音：LFO 调制频率
        const lfo = ctx.createOscillator();
        const lg = ctx.createGain();
        lfo.frequency.value = o.vib.rate || 6;
        lg.gain.value = o.vib.depth || 6;
        lfo.connect(lg);
        lg.connect(osc.frequency);
        lfo.start(t0);
        track(lfo, [lfo, lg], o.live || null);
        lfo.stop(t0 + dur + 0.06);
      }
      g = ctx.createGain();
      const pk = Math.max(0.0002, (o.peak || 0.1) * V);
      const atk = Math.min(o.a != null ? o.a / R : 0.005, dur * 0.6);
      g.gain.setValueAtTime(0.0002, t0);
      g.gain.exponentialRampToValueAtTime(pk, t0 + atk);
      if (o.h) g.gain.setValueAtTime(pk, t0 + Math.min(o.h / R, dur * 0.85));
      g.gain.exponentialRampToValueAtTime(0.0002, t0 + dur);
      const nodes = [osc, g];
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
      track(osc, nodes, o.live || null);
      osc.stop(t0 + dur + 0.06);
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
    const R = CUR.rate, V = CUR.vol;
    let src = null, g = null, fl = null, started = false;
    try {
      const t0 = o.t;
      const dest = o.dest || (CURTD ? CURTD.gain : sfxBus);
      const dur = Math.max(0.006, (o.dur || 0.1) / R);
      src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      fl = ctx.createBiquadFilter();
      fl.type = o.ft || 'bandpass';
      fl.Q.value = o.q || 1;
      fl.frequency.setValueAtTime(Math.max(10, (o.f || 1000) * R), t0);
      if (o.f2) fl.frequency.exponentialRampToValueAtTime(Math.max(10, o.f2 * R), t0 + dur);
      g = ctx.createGain();
      const pk = Math.max(0.0002, (o.peak || 0.1) * V);
      const atk = Math.min(o.a != null ? o.a / R : 0.004, dur * 0.5);
      g.gain.setValueAtTime(0.0002, t0);
      g.gain.exponentialRampToValueAtTime(pk, t0 + atk);
      g.gain.exponentialRampToValueAtTime(0.0002, t0 + dur);
      src.connect(fl); fl.connect(g); g.connect(dest);
      src.start(t0, Math.random() * 0.4); started = true;
      track(src, [src, fl, g], o.live || null);
      src.stop(t0 + dur + 0.06);
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

  /* ================= 26 个 SFX cue ================= */
  const cues = {
    /* ui：短方波 click + 一撮高频噪声，30ms 内收尾，UI 反馈干脆 */
    ui: function (t) {
      vo({ t: t, type: 'square', f: 1400, f2: 1000, dur: 0.035, a: 0.002,
        peak: 0.10, ft: 'lowpass', fq: 3400, q: 0.6 });
      click(t, 0.05, 5200);
    },

    /* jump：三角波 360→760Hz 上滑，一段跳的轻快上扬 */
    jump: function (t) {
      vo({ t: t, type: 'triangle', f: 360, f2: 760, dur: 0.13, a: 0.004,
        peak: 0.13, ft: 'lowpass', fq: 3000, q: 0.6 });
      vo({ t: t, type: 'sine', f: 720, f2: 1180, dur: 0.08, a: 0.003, peak: 0.05 });
    },

    /* djump：二段跳起音更高更亮，方波 620→1250Hz + 高频点 */
    djump: function (t) {
      vo({ t: t, type: 'square', f: 620, f2: 1250, dur: 0.15, a: 0.003,
        peak: 0.10, ft: 'lowpass', fq: 4200, q: 0.6 });
      vo({ t: t + 0.05, type: 'sine', f: 1568, dur: 0.12, a: 0.002, peak: 0.05 });
      click(t, 0.04, 6000);
    },

    /* land：落地闷响，正弦 200→70Hz 砸下 + 一层低通噪声尘 */
    land: function (t) {
      vo({ t: t, type: 'sine', f: 200, f2: 70, dur: 0.13, a: 0.002, peak: 0.30 });
      nz({ t: t, dur: 0.07, peak: 0.13, ft: 'lowpass', f: 420, f2: 130, q: 0.7 });
    },

    /* slide：摩擦噪声，带通 1400→520Hz 下滑 + 低频隆隆 */
    slide: function (t) {
      nz({ t: t, dur: 0.34, peak: 0.16, ft: 'bandpass', f: 1400, f2: 520, q: 0.9 });
      vo({ t: t, type: 'sine', f: 90, dur: 0.30, a: 0.01, peak: 0.08,
        ft: 'lowpass', fq: 220, q: 0.6 });
    },

    /* dash：破空 whoosh，上扫噪声接下扫尾音 + 一道上扬正弦 */
    dash: function (t) {
      nz({ t: t, dur: 0.17, peak: 0.20, ft: 'bandpass', f: 380, f2: 3400, q: 0.8 });
      nz({ t: t + 0.15, dur: 0.19, peak: 0.15, ft: 'bandpass', f: 3400, f2: 700, q: 0.8 });
      vo({ t: t, type: 'sine', f: 200, f2: 900, dur: 0.20, a: 0.005, peak: 0.07 });
    },

    /* hurt：闷响 + 哨音，170→65Hz 重击叠 1500→520Hz 下行哨 */
    hurt: function (t) {
      vo({ t: t, type: 'sine', f: 170, f2: 65, dur: 0.16, a: 0.002, peak: 0.32 });
      vo({ t: t + 0.02, type: 'sine', f: 1500, f2: 520, dur: 0.28, a: 0.02, peak: 0.10 });
      nz({ t: t, dur: 0.12, peak: 0.18, ft: 'lowpass', f: 320, f2: 90, q: 0.7 });
    },

    /* die：长下滑，锯齿 340→45Hz 扫落 + 低通噪声床，末段补一记 sub */
    die: function (t) {
      vo({ t: t, type: 'sawtooth', f: 340, f2: 45, dur: 0.85, a: 0.006,
        peak: 0.22, ft: 'lowpass', fq: 1400, fq2: 260, q: 0.7 });
      vo({ t: t, type: 'sine', f: 220, f2: 40, dur: 0.80, a: 0.004, peak: 0.24 });
      nz({ t: t, dur: 0.70, peak: 0.22, ft: 'lowpass', f: 1800, f2: 120, q: 0.6 });
      vo({ t: t + 0.55, type: 'sine', f: 70, f2: 38, dur: 0.34, a: 0.003, peak: 0.34 });
    },

    /* coin：亮 ping，2100Hz 主音 + 3150Hz 泛音 + 高频点 */
    coin: function (t) {
      vo({ t: t, type: 'sine', f: 2100, dur: 0.24, a: 0.002, peak: 0.14 });
      vo({ t: t, type: 'sine', f: 3150, dur: 0.14, a: 0.002, peak: 0.05 });
      click(t, 0.04, 7000);
    },

    /* cheese：双音叮，988Hz 后接 1319Hz，奶酪的"叮-叮" */
    cheese: function (t) {
      vo({ t: t, type: 'triangle', f: 988, dur: 0.10, a: 0.003, peak: 0.15 });
      vo({ t: t + 0.085, type: 'triangle', f: 1319, dur: 0.22, a: 0.003, peak: 0.17 });
      nz({ t: t + 0.085, dur: 0.12, peak: 0.03, ft: 'highpass', f: 6800, q: 0.7 });
    },

    /* gem：三音琶音 1568/2093/2637Hz，钻石的高贵三连 */
    gem: function (t) {
      const seq = [1568, 2093, 2637];
      for (let i = 0; i < seq.length; i++) {
        vo({ t: t + i * 0.07, type: 'triangle', f: seq[i],
          dur: i === 2 ? 0.3 : 0.12, a: 0.003, peak: 0.13 + i * 0.015 });
      }
      vo({ t: t + 0.14, type: 'sine', f: 3136, dur: 0.3, a: 0.004, peak: 0.05 });
    },

    /* pickup：上行双音 660→990Hz，通用道具拾取 */
    pickup: function (t) {
      vo({ t: t, type: 'triangle', f: 660, dur: 0.08, a: 0.003, peak: 0.15 });
      vo({ t: t + 0.07, type: 'triangle', f: 990, dur: 0.16, a: 0.003, peak: 0.17 });
    },

    /* powerup：上行三连音 523/659/784Hz，末音拖长并带空气感 */
    powerup: function (t) {
      const seq = [523.25, 659.25, 783.99];
      for (let i = 0; i < seq.length; i++) {
        vo({ t: t + i * 0.09, type: 'triangle', f: seq[i],
          dur: i === 2 ? 0.32 : 0.12, a: 0.004, peak: 0.14 + i * 0.02 });
      }
      nz({ t: t + 0.18, dur: 0.24, a: 0.03, peak: 0.028, ft: 'highpass', f: 6500, q: 0.6 });
    },

    /* stomp：踩扁音，噪声短爆 + 700→140Hz 快速塌陷的"噗" */
    stomp: function (t) {
      nz({ t: t, dur: 0.09, peak: 0.26, ft: 'lowpass', f: 900, f2: 180, q: 0.7 });
      vo({ t: t, type: 'sine', f: 700, f2: 140, dur: 0.10, a: 0.002, peak: 0.24 });
      click(t, 0.08, 4200);
    },

    /* kill：小爆，带通噪声 1800→450Hz + 240→70Hz 短坠 */
    kill: function (t) {
      nz({ t: t, dur: 0.20, peak: 0.28, ft: 'bandpass', f: 1800, f2: 450, q: 0.8 });
      vo({ t: t, type: 'sine', f: 240, f2: 70, dur: 0.18, a: 0.002, peak: 0.26 });
      click(t, 0.09, 5000);
    },

    /* explode：大爆，75→34Hz sub + 全频噪声坠落 + 二次轰响 */
    explode: function (t) {
      vo({ t: t, type: 'sine', f: 75, f2: 34, dur: 0.70, a: 0.003, peak: 0.50 });
      nz({ t: t, dur: 0.60, peak: 0.34, ft: 'lowpass', f: 5000, f2: 160, q: 0.6 });
      vo({ t: t + 0.16, type: 'sine', f: 190, f2: 55, dur: 0.32, a: 0.003, peak: 0.28 });
      nz({ t: t + 0.16, dur: 0.28, peak: 0.18, ft: 'bandpass', f: 700, f2: 140, q: 0.8 });
      click(t, 0.14, 4400);
    },

    /* freeze：玻璃感，四枚高泛音碎裂 ping 错落落下 + 高通碎屑 */
    freeze: function (t) {
      const pings = [[3100, 0], [4200, 0.05], [2600, 0.10], [5200, 0.16]];
      for (let i = 0; i < pings.length; i++) {
        vo({ t: t + pings[i][1], type: 'sine', f: pings[i][0], dur: 0.16,
          a: 0.002, peak: 0.08, ft: 'highpass', fq: 2200, q: 0.7 });
      }
      nz({ t: t + 0.02, dur: 0.22, peak: 0.09, ft: 'highpass', f: 4800, q: 0.7 });
    },

    /* emp：电流噪声，带通噪声扫落 + 三段方波电流嗡鸣 */
    emp: function (t) {
      nz({ t: t, dur: 0.30, peak: 0.16, ft: 'bandpass', f: 3200, f2: 700, q: 1.1 });
      const buzz = [92, 124, 148];
      for (let i = 0; i < buzz.length; i++) {
        vo({ t: t + i * 0.045, type: 'square', f: buzz[i], dur: 0.05, a: 0.002,
          peak: 0.07, ft: 'bandpass', fq: 1200, q: 2.2 });
      }
      nz({ t: t + 0.16, dur: 0.18, peak: 0.07, ft: 'highpass', f: 6200, q: 0.6 });
    },

    /* mega：必杀蓄力 + 释放，180→2200Hz 上扫蓄力后 sub 砸落 + 大三和弦 */
    mega: function (t) {
      vo({ t: t, type: 'sawtooth', f: 180, f2: 2200, dur: 0.55, a: 0.08,
        peak: 0.10, ft: 'lowpass', fq: 400, fq2: 5000, q: 0.8 });
      vo({ t: t + 0.55, type: 'sine', f: 90, f2: 35, dur: 0.50, a: 0.003, peak: 0.50 });
      nz({ t: t + 0.55, dur: 0.45, peak: 0.32, ft: 'lowpass', f: 4200, f2: 150, q: 0.6 });
      const chord = [523.25, 659.25, 783.99];
      for (let i = 0; i < chord.length; i++) {
        vo({ t: t + 0.55, type: 'square', f: chord[i], dur: 0.36, a: 0.004,
          peak: 0.07, ft: 'lowpass', fq: 3400, q: 0.6 });
      }
      click(t + 0.55, 0.14, 4600);
    },

    /* combo：短 blip，opts.rate 抬音高（连击越高越尖），随连击数上行 */
    combo: function (t) {
      vo({ t: t, type: 'square', f: 620, f2: 900, dur: 0.05, a: 0.003,
        peak: 0.11, ft: 'lowpass', fq: 4200, q: 0.7 });
      vo({ t: t, type: 'sine', f: 310, dur: 0.04, a: 0.002, peak: 0.06 });
    },

    /* style：风格升级上行三连音 784/988/1175Hz，金属钟声音色 + 闪光尾 */
    style: function (t) {
      const seq = [784, 988, 1174.66];
      for (let i = 0; i < seq.length; i++) {
        vo({ t: t + i * 0.085, type: 'square', f: seq[i], det: i % 2 ? 8 : -8,
          dur: i === 2 ? 0.3 : 0.12, a: 0.003, peak: 0.12,
          ft: 'bandpass', fq: 1800, q: 1.2 });
        vo({ t: t + i * 0.085, type: 'sawtooth', f: seq[i] * 2, det: i % 2 ? -10 : 10,
          dur: i === 2 ? 0.3 : 0.1, a: 0.004, peak: 0.045,
          ft: 'lowpass', fq: 4200, q: 0.6 });
      }
      nz({ t: t + 0.18, dur: 0.2, peak: 0.03, ft: 'highpass', f: 7200, q: 0.7 });
    },

    /* star：闪烁，四枚高音快速交替闪烁（无敌星启动） */
    star: function (t) {
      const seq = [2093, 2637, 3136, 4186];
      for (let i = 0; i < seq.length; i++) {
        vo({ t: t + i * 0.055, type: 'sine', f: seq[i], dur: 0.14, a: 0.002,
          peak: 0.09, ft: 'highpass', fq: 1600, q: 0.7 });
      }
      nz({ t: t, dur: 0.24, a: 0.02, peak: 0.035, ft: 'highpass', f: 7000, q: 0.6 });
    },

    /* clock：倒计时滴答，1100→900Hz 木鱼式短响（与 ui 明显不同） */
    clock: function (t) {
      vo({ t: t, type: 'sine', f: 1100, f2: 880, dur: 0.032, a: 0.001, peak: 0.12 });
      nz({ t: t, dur: 0.016, peak: 0.05, ft: 'bandpass', f: 2000, q: 1.2 });
    },

    /* checkpoint：双音确认 587→880Hz，暖三角波（存档点确认） */
    checkpoint: function (t) {
      vo({ t: t, type: 'triangle', f: 587.33, dur: 0.11, a: 0.004, peak: 0.15 });
      vo({ t: t + 0.10, type: 'triangle', f: 880, dur: 0.28, a: 0.004, peak: 0.17 });
      vo({ t: t + 0.10, type: 'sine', f: 1760, dur: 0.12, a: 0.003, peak: 0.04 });
    },

    /* clear：通关上行琶音 392→1046Hz，最后一音长延 + 八度闪光 */
    clear: function (t) {
      const seq = [392, 523.25, 659.25, 783.99, 1046.5];
      for (let i = 0; i < seq.length; i++) {
        vo({ t: t + i * 0.10, type: 'triangle', f: seq[i],
          dur: i === 4 ? 0.8 : 0.16, a: 0.005, h: i === 4 ? 0.3 : 0.06,
          peak: 0.13 + i * 0.015 });
        if (i >= 2) {
          vo({ t: t + i * 0.10, type: 'square', f: seq[i] * 2, dur: 0.12, a: 0.004,
            peak: 0.03, ft: 'lowpass', fq: 4200, q: 0.6 });
        }
      }
      nz({ t: t + 0.44, dur: 0.35, peak: 0.03, ft: 'highpass', f: 7000, q: 0.7 });
    },

    /* gameover：下行悲鸣，锯齿带颤音逐级下行 + 低频闷响与持续低音 */
    gameover: function (t) {
      const seq = [440, 392, 330, 262];
      for (let i = 0; i < seq.length; i++) {
        vo({ t: t + i * 0.24, type: 'sawtooth', f: seq[i], dur: 0.3, a: 0.02,
          h: 0.12, peak: 0.13, ft: 'lowpass', fq: 1500, q: 0.8,
          vib: { rate: 5.5, depth: 7 } });
      }
      vo({ t: t, type: 'sine', f: 120, f2: 55, dur: 0.5, a: 0.003, peak: 0.26 });
      nz({ t: t, dur: 0.3, peak: 0.12, ft: 'lowpass', f: 320, f2: 100, q: 0.7 });
      vo({ t: t + 0.72, type: 'sine', f: 98, dur: 0.9, a: 0.06, peak: 0.12 });
    }
  };

  /* ================= BGM 5 轨（全程序化） =================
   * menu      100BPM 舒缓 pad + 慢琶音
   * run       132BPM 跳动方波主旋律 + 贝斯 + 轻鼓点
   * danger    150BPM 紧张快速鼓点 + 半音贝斯
   * clear     120BPM 胜利小号 + 上行琶音
   * gameover   66BPM 下行琶音 + 闷响
   * BGM 内部混合级 bgmOut=0.22 压低，不抢音效。 */

  function bKick(t, f, pk) {
    vo(D({ t: t, type: 'sine', f: f || 150, f2: 44, slide: 0.09, dur: 0.15,
      a: 0.003, peak: pk || 0.5 }));
  }
  function bBass(f, t, dur, pk) {
    vo(D({ t: t, type: 'sawtooth', f: f, dur: dur, a: 0.004, peak: pk || 0.22,
      ft: 'lowpass', fq: 820, q: 0.7 }));
  }
  function bHat(t, pk) {
    nz(D({ t: t, dur: 0.03, peak: pk || 0.03, ft: 'highpass', f: 7500, q: 0.7 }));
  }
  function bSnare(t) {
    nz(D({ t: t, dur: 0.09, peak: 0.085, ft: 'bandpass', f: 1900, q: 0.8 }));
    nz(D({ t: t, dur: 0.05, peak: 0.05, ft: 'highpass', f: 4000, q: 0.7 }));
  }
  function bLead(f, t, dur) {
    vo(D({ t: t, type: 'square', f: f, dur: dur, a: 0.008, h: dur * 0.3,
      peak: 0.075, ft: 'lowpass', fq: 2600, q: 0.6,
      det: Math.random() * 8 - 4 }));
  }

  /* --- menu：pad + 慢琶音 --- */
  const MENU_CH = [
    [45, 52, 55, 59],   // Am7
    [41, 48, 52, 57],   // Fmaj7
    [36, 43, 47, 52],   // Cmaj7
    [43, 47, 50, 55]    // G
  ];
  const MENU_ARP = [0, 3, 6, 10, 12];
  const MENU_IDX = [0, 1, 2, 3, 2];
  function menuStep(td, s, t) {
    const bar = (s >> 4) & 3, pos = s & 15, ch = MENU_CH[bar];
    const barLen = 60 / td.bpm * 4;
    if (pos === 0) {                       // 铺底 pad：失谐双锯齿慢起
      for (let i = 0; i < ch.length; i++) {
        vo(D({ t: t, type: 'sawtooth', f: mf(ch[i]), dur: barLen, a: 0.7,
          h: barLen - 1.0, peak: 0.05, ft: 'lowpass', fq: 720, q: 0.4, det: -5 }));
        vo(D({ t: t, type: 'sawtooth', f: mf(ch[i]), dur: barLen, a: 0.7,
          h: barLen - 1.0, peak: 0.05, ft: 'lowpass', fq: 720, q: 0.4, det: 5 }));
      }
      vo(D({ t: t, type: 'sine', f: mf(ch[0] - 12), dur: 0.6, a: 0.01, peak: 0.10 }));
    }
    const ai = MENU_ARP.indexOf(pos);
    if (ai >= 0) {                          // 慢琶音
      vo(D({ t: t, type: 'triangle', f: mf(ch[MENU_IDX[ai]] + 12), dur: 0.5,
        a: 0.02, h: 0.15, peak: 0.06 }));
    }
    if (pos === 8) nz(D({ t: t, dur: 0.25, a: 0.05, peak: 0.012, ft: 'highpass', f: 8000, q: 0.6 }));
  }

  /* --- run：跳动的方波主旋律 + 贝斯 + 轻鼓点 --- */
  const RUN_ROOTS = [45, 45, 41, 43];      // A2 A2 F2 G2
  const RUN_LEAD = [
    [[0, 69, 2], [3, 72, 2], [6, 76, 3], [10, 74, 2], [12, 72, 2]],
    [[0, 69, 2], [2, 72, 2], [4, 74, 2], [6, 76, 3], [10, 79, 3], [14, 76, 2]],
    [[0, 77, 2], [3, 81, 3], [6, 79, 2], [8, 76, 2], [11, 72, 2], [14, 74, 2]],
    [[0, 76, 3], [4, 74, 2], [6, 72, 2], [8, 69, 4], [13, 67, 3]]
  ];
  function runStep(td, s, t) {
    const bar = (s >> 4) & 3, pos = s & 15, root = RUN_ROOTS[bar];
    const st = 60 / td.bpm / 4;
    if (pos === 0 || pos === 8) bKick(t, 150, 0.42);
    if (pos === 4 || pos === 12) bSnare(t);
    if (pos % 2 === 1) bHat(t, 0.026);
    if (pos % 2 === 0) {                   // 八分音符贝斯
      const off = (pos % 8 === 6) ? 7 : 0;
      bBass(mf(root + off), t, st * 0.9, pos % 8 === 0 ? 0.24 : 0.18);
    }
    const barNotes = RUN_LEAD[bar];
    for (let i = 0; i < barNotes.length; i++) {
      if (barNotes[i][0] === pos) {
        bLead(mf(barNotes[i][1]), t, barNotes[i][2] * st * 0.9);
      }
    }
  }

  /* --- danger：紧张快速鼓点 + 半音贝斯 --- */
  const DANGER_ROOT = [40, 39, 38, 39];    // E Eb D Eb 半音压迫
  function dangerStep(td, s, t) {
    const pos = s & 15, st = 60 / td.bpm / 4;
    if (pos % 4 === 0) bKick(t, 140, 0.44);
    if (pos === 7 || pos === 15) bKick(t, 120, 0.3);
    if (pos === 4 || pos === 12) bSnare(t);
    bHat(t, pos % 2 === 0 ? 0.022 : 0.016);
    const root = DANGER_ROOT[(pos >> 1) & 3];
    bBass(mf(root), t, st * 0.85, pos % 8 === 0 ? 0.26 : 0.2);
    if (pos === 0) {                        // 高频紧张脉冲：相邻小二度交替
      vo(D({ t: t, type: 'square', f: mf(76 + (((s >> 4) & 1) ? 1 : 0)),
        dur: 0.5, a: 0.05, h: 0.3, peak: 0.028, ft: 'lowpass', fq: 3600, q: 0.6 }));
    }
  }

  /* --- clear：胜利小号 + 上行琶音 --- */
  const CLEAR_NOTES = [
    [0, 67, 2], [2, 67, 2], [4, 67, 2], [6, 72, 4], [10, 76, 6],
    [16, 72, 2], [18, 76, 2], [20, 79, 2], [22, 84, 4]
  ];
  function clearStep(td, s, t) {
    const pos = s & 15, st = 60 / td.bpm / 4;
    for (let i = 0; i < CLEAR_NOTES.length; i++) {
      const n = CLEAR_NOTES[i];
      if (n[0] === s) {
        vo(D({ t: t, type: 'sawtooth', f: mf(n[1]), dur: n[2] * st * 0.95,
          a: 0.02, h: n[2] * st * 0.4, peak: 0.09, ft: 'lowpass', fq: 3000, q: 0.8,
          vib: { rate: 6, depth: 7 } }));
        vo(D({ t: t, type: 'triangle', f: mf(n[1] + 12), dur: n[2] * st * 0.7,
          a: 0.02, peak: 0.04 }));
      }
    }
    if (s === 24) {                         // 收尾大三和弦
      const chord = [76, 79, 84];
      for (let i = 0; i < chord.length; i++) {
        vo(D({ t: t, type: 'sawtooth', f: mf(chord[i]), dur: 1.0, a: 0.02,
          h: 0.4, peak: 0.07, ft: 'lowpass', fq: 3200, q: 0.8 }));
      }
      nz(D({ t: t, dur: 0.4, a: 0.03, peak: 0.02, ft: 'highpass', f: 7000, q: 0.6 }));
    }
  }

  /* --- gameover：下行琶音 + 闷响 --- */
  const OVER_SEQ = [69, 67, 65, 64, 62, 60, 57];   // A4 G4 F4 E4 D4 C4 A3
  function overStep(td, s, t) {
    const st = 60 / td.bpm / 4;
    if (s % 4 === 0) {
      const i = (s / 4) % OVER_SEQ.length;
      vo(D({ t: t, type: 'sawtooth', f: mf(OVER_SEQ[i]), dur: st * 3.6, a: 0.05,
        h: st * 1.6, peak: 0.075, ft: 'lowpass', fq: 1200, q: 0.8,
        vib: { rate: 4.5, depth: 5 } }));
    }
    if (s === 0 || s === 16) {              // 闷响 + 低音持续
      vo(D({ t: t, type: 'sine', f: 120, f2: 55, dur: 0.6, a: 0.003, peak: 0.26 }));
      nz(D({ t: t, dur: 0.3, peak: 0.12, ft: 'lowpass', f: 320, f2: 100, q: 0.7 }));
      vo(D({ t: t, type: 'sine', f: 98, dur: st * 14, a: 0.08, peak: 0.10 }));
    }
  }

  const tracks = {
    menu:     { bpm: 100, total: 64, level: 0.9,  stepFn: menuStep },
    run:      { bpm: 132, total: 64, level: 1.0,  stepFn: runStep },
    danger:   { bpm: 150, total: 32, level: 1.0,  stepFn: dangerStep },
    clear:    { bpm: 120, total: 32, level: 0.95, stepFn: clearStep },
    gameover: { bpm: 66,  total: 32, level: 0.9,  stepFn: overStep }
  };
  const TRACK_KEYS = Object.keys(tracks);
  for (let i = 0; i < TRACK_KEYS.length; i++) {
    const td = tracks[TRACK_KEYS[i]];
    td.gain = null; td.live = []; td.timer = null;
    td.step = 0; td.next = 0; td.on = false;
  }

  function bgmTick(td) {
    if (!td.on || !ctx) return;
    CURTD = td; CUR.rate = 1; CUR.vol = 1;
    const st = 60 / td.bpm / 4;
    const horizon = ctx.currentTime + AHEAD;
    let guard = 0;
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
    if (!ctx || !td.gain) return;
    try {
      const g = td.gain.gain, t = ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(0.0001, g.value), t);
      g.exponentialRampToValueAtTime(0.0001, t + 0.5);
    } catch (e) {}
    setTimeout(function () { killLive(td.live); }, 620);
  }

  function startBGM(name) {
    if (!ensure()) return;
    const key = (name === 'over') ? 'gameover' : name;   // 契约 API 写 'over'，轨道表写 'gameover'
    const td = tracks[key];
    if (!td) return;                                    // 未知轨安全 no-op
    resumeCtx();
    if (bgmName === key && td.on) return;                // 同轨幂等
    if (bgmName && tracks[bgmName] && tracks[bgmName].on) fadeOut(tracks[bgmName]);
    bgmName = key;
    td.on = true; td.step = 0; td.next = ctx.currentTime + 0.08;
    try {                                               // 淡入，切轨平滑
      const g = td.gain.gain, t = ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(0.0001, g.value), t);
      g.exponentialRampToValueAtTime(td.level, t + 0.6);
    } catch (e) {}
    if (td.timer) clearInterval(td.timer);
    td.timer = setInterval(function () { bgmTick(td); }, TICK_MS);
    bgmTick(td);
  }

  function stopBGM() {
    if (bgmName && tracks[bgmName]) fadeOut(tracks[bgmName]);
    bgmName = null;
  }

  /* ================= 生命周期 ================= */
  function ensure() {
    if (ctx) return true;
    const AC = (typeof window !== 'undefined') &&
      (window.AudioContext || window.webkitAudioContext);
    if (!AC) return false;
    try { ctx = new AC(); } catch (e) { ctx = null; return false; }
    try {
      master = ctx.createGain();
      master.gain.value = mutedAll ? 0.0001 : 1;
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 20; comp.ratio.value = 8;
      comp.attack.value = 0.003; comp.release.value = 0.18;
      master.connect(comp); comp.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = volSfx * (muteSfx ? 0 : 1);
      sfxBus.connect(master);
      bgmOut = ctx.createGain();
      bgmOut.gain.value = BGM_BASE * volBgm * (muteBgm ? 0 : 1);
      bgmOut.connect(master);
      for (let i = 0; i < TRACK_KEYS.length; i++) {
        const td = tracks[TRACK_KEYS[i]];
        td.gain = ctx.createGain();
        td.gain.gain.value = 0.0001;
        td.gain.connect(bgmOut);
      }
      const sr = ctx.sampleRate || 44100;
      noiseBuf = ctx.createBuffer(1, sr, sr);
      const ch = noiseBuf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    } catch (e) { /* 音频不可用时静默降级 */ }
    bindOnce();
    return true;
  }

  function resumeCtx() {
    if (!ctx || ctx.state !== 'suspended' || !ctx.resume) return;
    try {
      const p = ctx.resume();
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }

  function onVis() {
    if (!ctx) return;
    if (document.hidden) stopBGM();   // 隐藏即停 BGM；回前台不自动重启，由 game.js 决定
  }

  function onGesture() { unlock(); }

  function bindOnce() {
    if (bound || typeof document === 'undefined') return;
    bound = true;
    const opt = { passive: true, capture: true };
    document.addEventListener('pointerdown', onGesture, opt);
    document.addEventListener('touchend', onGesture, opt);
    document.addEventListener('keydown', onGesture, opt);
    document.addEventListener('visibilitychange', onVis, false);
  }

  /* ---------------- 对外接口 ---------------- */
  function init() {
    // 惰性：这里只挂事件监听，不创建 AudioContext；
    // 等第一次真正发声（unlock / play / startBGM）时才 new AudioContext。
    bindOnce();
  }

  function unlock() {                     // 幂等：iOS 首个用户手势 resume
    if (!ensure()) return;
    resumeCtx();
  }

  function play(name, opts) {
    if (!ensure()) return;
    const o = opts || {};
    CUR.rate = clamp(+o.rate || 1, 0.4, 3);
    CUR.vol = clamp(o.vol == null ? 1 : +o.vol, 0, 4);
    try {
      const t0 = ctx.currentTime + 0.02;
      if (ctx.state === 'suspended') resumeCtx();
      const c = cues[name];
      if (!c) return;                    // 未知 cue：安全 no-op，不抛异常
      c(t0);
    } catch (e) {} finally {
      CUR.rate = 1; CUR.vol = 1;
    }
  }

  function setVol(bgm, sfx) {
    if (bgm != null && isFinite(bgm)) volBgm = clamp(+bgm, 0, 1);
    if (sfx != null && isFinite(sfx)) volSfx = clamp(+sfx, 0, 1);
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      bgmOut.gain.cancelScheduledValues(t);
      bgmOut.gain.setTargetAtTime(BGM_BASE * volBgm * (muteBgm ? 0 : 1), t, 0.03);
      sfxBus.gain.cancelScheduledValues(t);
      sfxBus.gain.setTargetAtTime(volSfx * (muteSfx ? 0 : 1), t, 0.03);
    } catch (e) {}
  }

  function muted(b) {                    // 总静音
    mutedAll = !!b;
    if (!ctx || !master) return;
    try {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setTargetAtTime(mutedAll ? 0.0001 : 1, t, 0.015);
    } catch (e) {
      try { master.gain.value = mutedAll ? 0.0001 : 1; } catch (e2) {}
    }
  }

  function setMuteBgm(b) {               // BGM 独立静音
    muteBgm = !!b;
    if (!ctx || !bgmOut) return;
    try {
      const t = ctx.currentTime;
      bgmOut.gain.cancelScheduledValues(t);
      bgmOut.gain.setTargetAtTime(BGM_BASE * volBgm * (muteBgm ? 0 : 1), t, 0.03);
    } catch (e) {}
  }

  function setMuteSfx(b) {               // SFX 独立静音
    muteSfx = !!b;
    if (!ctx || !sfxBus) return;
    try {
      const t = ctx.currentTime;
      sfxBus.gain.cancelScheduledValues(t);
      sfxBus.gain.setTargetAtTime(volSfx * (muteSfx ? 0 : 1), t, 0.03);
    } catch (e) {}
  }

  return {
    init: init,
    unlock: unlock,
    play: play,
    startBGM: startBGM,
    stopBGM: stopBGM,
    setVol: setVol,
    muted: muted,
    setMuteBgm: setMuteBgm,
    setMuteSfx: setMuteSfx,
    names: NAMES.slice()
  };
})();
