/* 时间的尽头 — 环境声（WebAudio 全合成，零外部资源）
 * 一段缓慢的暗色氛围：低频 drone + 气声 + 高泛音 + 偶发深潜 swell。
 * 与场景的"时间流速"联动：时间流动时声音随之呼吸、膨胀。 */

(function () {
  'use strict';
  const TE = window.TE = window.TE || {};

  let ctx = null;
  let master = null;
  let swell = null;      // 随"时间流速"起伏的中低频气垫
  let droneGain = null;
  let started = false;
  let muted = false;
  let flowNow = 0;

  function makeNoise(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function buildGraph() {
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // ---- 主 drone：三个失谐低频振荡器，经缓慢开合的低通 ----
    const droneBus = ctx.createGain();
    droneBus.gain.value = 0.8;
    droneBus.connect(master);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 360;
    lp.Q.value = 0.5;
    lp.connect(droneBus);

    droneGain = ctx.createGain();
    droneGain.gain.value = 0.5;
    droneGain.connect(lp);

    const freqs = [55, 82.41, 110.0];
    const types = ['triangle', 'sine', 'sine'];
    const gains = [0.14, 0.11, 0.05];
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = types[i];
      o.frequency.value = f;
      o.detune.value = (Math.random() * 10) - 5;
      const g = ctx.createGain();
      g.gain.value = gains[i];
      o.connect(g);
      g.connect(droneGain);
      o.start();
    });

    // 低通缓慢开合
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.045;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 170;
    lfo.connect(lfoGain);
    lfoGain.connect(lp.frequency);
    lfo.start();

    // ---- 气声（中频带通噪声）----
    const air = ctx.createBufferSource();
    air.buffer = makeNoise(2);
    air.loop = true;
    const airBP = ctx.createBiquadFilter();
    airBP.type = 'bandpass';
    airBP.frequency.value = 820;
    airBP.Q.value = 0.6;
    const airGain = ctx.createGain();
    airGain.gain.value = 0.055;
    air.connect(airBP);
    airBP.connect(airGain);
    airGain.connect(master);
    air.start();

    // ---- 高泛音（微弱的冰冷微光）----
    const shimmer = ctx.createBufferSource();
    shimmer.buffer = makeNoise(2);
    shimmer.loop = true;
    const shHP = ctx.createBiquadFilter();
    shHP.type = 'highpass';
    shHP.frequency.value = 4200;
    const shGain = ctx.createGain();
    shGain.gain.value = 0.012;
    shimmer.connect(shHP);
    shHP.connect(shGain);
    shGain.connect(master);
    shimmer.start();

    // ---- swell：随时间流速呼吸的中低频气垫 ----
    swell = ctx.createGain();
    swell.gain.value = 0.4;
    swell.connect(master);
    const swellOsc = ctx.createOscillator();
    swellOsc.type = 'sine';
    swellOsc.frequency.value = 164.81;
    const swellLfo = ctx.createOscillator();
    swellLfo.frequency.value = 0.07;
    const swellLfoGain = ctx.createGain();
    swellLfoGain.gain.value = 60;
    swellLfo.connect(swellLfoGain);
    swellLfoGain.connect(swellOsc.frequency);
    const swellOut = ctx.createGain();
    swellOut.gain.value = 0.05;
    swellOsc.connect(swellOut);
    swellOut.connect(swell);
    swellOsc.start();
    swellLfo.start();

    // ---- 深潜 sub：偶发（约 18 秒一次）的低频心跳 ----
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 27.5;
    const subGain = ctx.createGain();
    subGain.gain.value = 0;
    sub.connect(subGain);
    subGain.connect(master);
    sub.start();
    scheduleSub(subGain);
  }

  function scheduleSub(subGain) {
    const tick = () => {
      const t = ctx.currentTime;
      subGain.gain.cancelScheduledValues(t);
      subGain.gain.setValueAtTime(0.0001, t);
      subGain.gain.exponentialRampToValueAtTime(0.14, t + 2.6);
      subGain.gain.exponentialRampToValueAtTime(0.0001, t + 9.5);
      setTimeout(tick, 18000 + Math.random() * 8000);
    };
    setTimeout(tick, 6000 + Math.random() * 5000);
  }

  function rampTo(target, seconds) {
    if (!ctx || !master) return;
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setTargetAtTime(target, t, seconds / 3);
  }

  TE.audio = {
    init() {
      if (ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        ctx = new AC();
        buildGraph();
      } catch (err) {
        ctx = null;
        master = null;
      }
    },

    ensureStarted() {
      this.init();
      if (!ctx || started) return;
      started = true;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      this.setFlow(flowNow);
      rampTo(muted ? 0 : 0.55, 2.4);
    },

    toggle() {
      this.ensureStarted();
      muted = !muted;
      rampTo(muted ? 0 : 0.55, 1.4);
      return muted;
    },

    isMuted() { return muted; },

    // 场景每帧回传"时间流速"（0~1.6 量级），让声音随时间的流动呼吸
    setFlow(flow) {
      flowNow = flow;
      if (!ctx || !swell || !droneGain) return;
      const t = ctx.currentTime;
      const target = 0.30 + Math.min(1.0, flow * 0.55);
      swell.gain.setTargetAtTime(target, t, 1.2);
      droneGain.gain.setTargetAtTime(0.42 + Math.min(0.25, flow * 0.16), t, 1.4);
    },
  };
})();
