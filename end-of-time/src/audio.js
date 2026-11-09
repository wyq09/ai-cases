/* 时间的尽头 · 全合成声音设计：低频 drone / 气声 / 钟摆滴答 / 坍缩轰鸣 / 终焉寂静 */
window.EOT = window.EOT || {};

EOT.createAudio = function () {
  var ctx = null;
  var master = null;
  var droneGain = null, airGain = null;
  var muted = false;
  var started = false;
  var lastTick = -1;
  var tickAlt = false;

  function noiseBuffer(seconds) {
    var len = Math.floor(ctx.sampleRate * seconds);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function build() {
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.6;
    master.connect(ctx.destination);

    // 低频 drone：双音拍频 + 五度泛音
    droneGain = ctx.createGain();
    droneGain.gain.value = 0.2;
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 230; lp.Q.value = 0.6;
    droneGain.connect(lp); lp.connect(master);
    [[54, 'sine', 0.5], [54.45, 'sine', 0.5], [108.2, 'triangle', 0.16], [162, 'sine', 0.06]].forEach(function (cfg) {
      var o = ctx.createOscillator();
      o.type = cfg[1]; o.frequency.value = cfg[0];
      var g = ctx.createGain(); g.gain.value = cfg[2];
      o.connect(g); g.connect(droneGain); o.start();
    });
    var lfo = ctx.createOscillator();
    lfo.frequency.value = 0.055;
    var lfoG = ctx.createGain(); lfoG.gain.value = 0.07;
    lfo.connect(lfoG); lfoG.connect(droneGain.gain); lfo.start();

    // 气声：循环噪声带通
    var noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(3); noise.loop = true;
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 720; bp.Q.value = 1.1;
    airGain = ctx.createGain(); airGain.gain.value = 0.016;
    noise.connect(bp); bp.connect(airGain); airGain.connect(master);
    noise.start();
    var lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.11;
    var lfo2G = ctx.createGain(); lfo2G.gain.value = 0.008;
    lfo2.connect(lfo2G); lfo2G.connect(airGain.gain); lfo2.start();
  }

  function ensure() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      build();
    }
    if (ctx.state === 'suspended') ctx.resume();
    started = true;
    return true;
  }

  function tick() {
    if (!ctx || muted) return;
    var t = ctx.currentTime;
    tickAlt = !tickAlt;
    var o = ctx.createOscillator();
    o.type = 'square'; o.frequency.value = tickAlt ? 2100 : 1680;
    var hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 900;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.055, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(hp); hp.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.07);
  }

  function collapse() {
    if (!ctx || muted) return;
    var t = ctx.currentTime;
    // 轰鸣：噪声低通扫频
    var n = ctx.createBufferSource();
    n.buffer = noiseBuffer(2);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 1.4;
    lp.frequency.setValueAtTime(5200, t);
    lp.frequency.exponentialRampToValueAtTime(90, t + 1.5);
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.5, t + 0.06);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
    n.connect(lp); lp.connect(ng); ng.connect(master);
    n.start(t); n.stop(t + 2);
    //  sub 下坠
    var o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(34, t + 1.3);
    var og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.42, t + 0.05);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o.connect(og); og.connect(master);
    o.start(t); o.stop(t + 1.7);
    // 高频泛音尾韵
    [2093, 2637, 3136].forEach(function (f, i) {
      var s = ctx.createOscillator();
      s.type = 'sine'; s.frequency.value = f;
      var sg = ctx.createGain();
      var t0 = t + 0.3 + i * 0.12;
      sg.gain.setValueAtTime(0.0001, t0);
      sg.gain.exponentialRampToValueAtTime(0.02, t0 + 0.03);
      sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.2);
      s.connect(sg); sg.connect(master);
      s.start(t0); s.stop(t0 + 2.3);
    });
  }

  return {
    get muted() { return muted; },
    get started() { return started; },
    ensure: ensure,
    setMuted: function (m) {
      muted = m;
      if (ctx && master) master.gain.setTargetAtTime(m ? 0 : 0.6, ctx.currentTime, 0.08);
    },
    update: function (flow, simTime, terminal) {
      if (!ctx || ctx.state !== 'running') return;
      var target = terminal ? 0.035 : 0.1 + Math.min(flow, 3) * 0.09;
      droneGain.gain.setTargetAtTime(target, ctx.currentTime, 0.4);
      airGain.gain.setTargetAtTime(terminal ? 0.004 : 0.01 + Math.min(flow, 3) * 0.008, ctx.currentTime, 0.4);
      var sec = Math.floor(simTime);
      if (sec !== lastTick) {
        lastTick = sec;
        if (!terminal && flow > 0.03) tick();
      }
    },
    collapse: collapse
  };
};