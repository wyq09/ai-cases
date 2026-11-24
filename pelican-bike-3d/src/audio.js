/* 鹈鹕骑车 · 音频 —— 全部 WebAudio 合成，零音频文件。
 * 物理约束：月面是真空，声音传不出去。你听到的一切都是"隔着头盔和车架"传来的：
 * 呼吸、电台底噪、轮胎/链条通过车架的振动、落地的闷响。腾空时轮胎噪音消失；车铃只会震，不会响。 */
(function () {
  'use strict';
  window.PM = window.PM || {};
  var PM = window.PM;
  var ctx = null, master = null, helmet = null, muted = false, nodes = {}, started = false, tickPhase = 0, rnd = Math.random;

  function noiseBuffer(seconds) {
    var len = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  function loopNoise() { var src = ctx.createBufferSource(); src.buffer = noiseBuffer(2); src.loop = true; src.start(); return src; }
  function filter(type, freq, q) { var f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q; return f; }
  function gain(v) { var g = ctx.createGain(); g.gain.value = v; return g; }

  function build() {
    master = gain(muted ? 0 : 1);
    helmet = filter('lowpass', 5200, 0.7);                 // 头盔：高频被挡掉一层
    master.connect(helmet); helmet.connect(ctx.destination);
    // 呼吸
    var breath = loopNoise(), bf = filter('bandpass', 620, 0.9), bg = gain(0);
    breath.connect(bf); bf.connect(bg); bg.connect(master);
    // 电台底噪 + 面罩风扇
    var hum = ctx.createOscillator(); hum.type = 'sine'; hum.frequency.value = 56; var hg = gain(0.007); hum.connect(hg); hg.connect(master); hum.start();
    var fan = ctx.createOscillator(); fan.type = 'triangle'; fan.frequency.value = 224; var fg = gain(0.0035); fan.connect(fg); fg.connect(master); fan.start();
    var radio = loopNoise(), rf = filter('highpass', 3400, 0.7), rg = gain(0.0035); radio.connect(rf); rf.connect(rg); rg.connect(master);
    // 轮胎：接地时才有，随速度
    var tyre = loopNoise(), tf = filter('lowpass', 260, 0.8), tg = gain(0); tyre.connect(tf); tf.connect(tg); tg.connect(master);
    // 传动：链条/脚踏通过车架传来的振动
    var drive = loopNoise(), df = filter('bandpass', 980, 1.4), dg = gain(0); drive.connect(df); df.connect(dg); dg.connect(master);
    // 风：没有。月面没有空气
    nodes = { breath: bg, tyre: tg, drive: dg };
  }

  function unlock() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC(); build(); started = true;
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  // 一次性音效
  function burst(dur, type, freq, q, vol, sweepTo) {
    if (!ctx) return;
    var src = ctx.createBufferSource(); src.buffer = noiseBuffer(dur + 0.05);
    var f = filter(type, freq, q), g = gain(0), t = ctx.currentTime;
    if (sweepTo) { f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur); }
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    src.connect(f); f.connect(g); g.connect(master); src.start(t); src.stop(t + dur + 0.06);
  }
  function tone(freq, dur, vol, type, sweepTo, delay) {
    if (!ctx) return;
    var o = ctx.createOscillator(), g = gain(0), t = ctx.currentTime + (delay || 0);
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (sweepTo) o.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  var NAMES = ['land', 'thud', 'discover', 'click', 'bell', 'hop', 'slip', 'tick', 'grab', 'start'];
  function play(name, opts) {
    if (!ctx || muted) return;
    opts = opts || {};
    var k = opts.volume === undefined ? 1 : opts.volume;
    switch (name) {
      case 'land': burst(0.16, 'lowpass', 420, 0.7, 0.22 * k); tone(92, 0.22, 0.2 * k, 'sine', 44); break;      // 通过车架传来的落地闷响
      case 'thud': burst(0.3, 'lowpass', 300, 0.7, 0.34 * k); tone(70, 0.4, 0.3 * k, 'sine', 34); break;
      case 'discover': tone(880, 0.09, 0.12, 'sine'); tone(1320, 0.14, 0.12, 'sine', null, 0.11); burst(0.05, 'highpass', 3000, 0.7, 0.05); break;   // 电台提示音
      case 'click': burst(0.02, 'bandpass', 2600, 2, 0.12); break;
      case 'bell': burst(0.035, 'bandpass', 2400, 6, 0.07, 2100); burst(0.03, 'bandpass', 3100, 8, 0.045, 2800); break;   // 骨传导：一点点 "嗒"，不是 "叮"
      case 'hop': burst(0.18, 'bandpass', 420, 1.2, 0.1); break;
      case 'slip': burst(0.35, 'bandpass', 1500, 0.8, 0.1 * k, 900); break;
      case 'tick': burst(0.014, 'bandpass', 1800, 3, 0.05); break;
      case 'grab': burst(0.05, 'bandpass', 900, 2, 0.1); break;
      case 'start': tone(660, 0.12, 0.1, 'sine'); tone(990, 0.2, 0.1, 'sine', null, 0.13); break;
    }
  }

  // 每帧：st = { v, grounded, drive, crank, air, effort }
  function update(dt, st, time) {
    if (!ctx || muted) return;
    var breath = Math.pow(0.5 + 0.5 * Math.sin(time * 2 * Math.PI / 4.2), 2.2);
    nodes.breath.gain.setTargetAtTime(0.02 * (0.55 + 0.45 * breath + 0.6 * (st.effort || 0)), ctx.currentTime, 0.12);
    nodes.tyre.gain.setTargetAtTime(st.grounded ? 0.07 * Math.min(st.v / 9, 1) : 0, ctx.currentTime, st.grounded ? 0.08 : 0.03);
    nodes.drive.gain.setTargetAtTime(0.035 * Math.min(st.drive / 90, 1) + 0.012 * Math.min(st.v / 9, 1), ctx.currentTime, 0.1);
    var phase = st.crank / (Math.PI / 4);                  // 每踏 1/8 圈，链条过一节
    if (Math.floor(phase) !== Math.floor(tickPhase) && st.grounded && st.v > 0.4) play('tick', { volume: 0.5 + st.drive / 90 });
    tickPhase = phase;
  }
  function setMuted(m) {
    muted = !!m;
    if (master) master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.05);
  }
  PM.AUDIO = {
    unlock: unlock, play: play, update: update, setMuted: setMuted, isMuted: function () { return muted; }, names: NAMES,
    isReady: function () { return !!ctx; }
  };
})();
