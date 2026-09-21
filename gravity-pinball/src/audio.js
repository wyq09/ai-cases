/* ============================================================
 * gravity-pinball · src/audio.js —— GP.AUDIO 全 WebAudio 程序化合成
 * 休闲弹球手游风：短促、干净、有弹性。零外部资源。
 *
 * 链路: sfxBus(用户音量) -> master(静音开关) -> DynamicsCompressor(-14/8) -> destination
 * applyOverrides: dataURL/ArrayBuffer 异步 decodeAudioData，成功后该名走 buffer，
 *   失败静默回落合成；原始 map 只存内存，不碰 localStorage。
 *
 * 音色表（全部合成）：
 *   bounce(i) 碰撞 blip    三角波 320+i*500Hz，dur 120->60ms，音量∝i，指数快衰减
 *   hit       bumper 命中  正弦 180Hz pluck + 高频噪声 click，清脆有弹性
 *   pop       消除爆       噪声 bandpass 1800->420 + 方波 660->220，80ms
 *   swallow   漩涡吸入     正弦 600->110Hz 300ms + 9Hz tremolo，神秘
 *   collect   收球         上行三连音 523/659/784，各 60ms
 *   clear     过关         C E G C E 五音琶音 262->659 + 尾音闪光垫
 *   bomb      低爆         噪声 lowpass 400->90 400ms + 60Hz 正弦 thump + duck
 *   click     UI 点击      1kHz 30ms tick
 *   slow      慢动作进入   噪声 bandpass 800->200 whoosh；{up:true}/slowUp 反向
 *   add       加球         双音上行 blip 523/784
 *   coin/float 浮分轻叮    1300Hz 50ms（float 更轻）
 *   generic   兜底轻 tick  未知名回落于此，不抛错
 *
 * play(name,{vol,pitch,rate})：vol 缩放峰值；pitch 缩放频率；rate 走带式
 * 缩放（时长/ret，频率×ret）。buffer 覆盖音 playbackRate = rate*pitch。
 * ============================================================ */
(function (global) {
  'use strict';

  /* ---------------- 内部状态 ---------------- */
  var ctx = null;        // AudioContext（惰性创建，无手势也可创建只是 suspended）
  var sfxBus = null;     // 用户音量支路
  var master = null;     // 静音开关
  var comp = null;       // DynamicsCompressor，多音叠加不削波
  var noiseBuf = null;   // 共享 1s 白噪声
  var muted = false;
  var volume = 0.8;      // 用户音量 0..1（与 cfg.sfxVolume 默认一致）
  var bound = false;     // 首手势监听只绑一次
  var live = [];         // 活跃 voice 源（stopAll / onended 防泄漏）
  var ovrBuf = {};       // name -> AudioBuffer（解码成功，优先使用）
  var ovrRaw = {};       // name -> 原始 dataURL/ArrayBuffer（ctx 未就绪时挂起）
  var lastT = {};        // 同名 cue 最小触发间隔（防同帧刷屏）
  var CURR = 1, CURP = 1; // play(opts) 注入的 rate/pitch，voice 内统一应用

  /* ---------------- 小工具 ---------------- */
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }

  function cleanup(nodes, src) {
    if (src) {
      try { src.onended = null; } catch (e0) {}
      try { src.stop(0); } catch (e1) {}
    }
    for (var j = 0; j < nodes.length; j++) {
      try { if (nodes[j]) nodes[j].disconnect(); } catch (e2) {}
    }
  }

  /* 节点用完 stop -> onended -> 全员 disconnect，防泄漏 */
  function reg(src, nodes) {
    live.push(src);
    src.onended = function () {
      var i = live.indexOf(src);
      if (i >= 0) live.splice(i, 1);
      for (var j = 0; j < nodes.length; j++) {
        try { nodes[j].disconnect(); } catch (e) {}
      }
      src.onended = null;
    };
  }

  /* ---------------- 上下文 / 图 ---------------- */
  function ensureCtx() {
    if (ctx) return ctx;
    var AC = null;
    try { AC = global.AudioContext || global.webkitAudioContext || null; } catch (e) { AC = null; }
    if (!AC) return null;
    try {
      ctx = new AC();
      sfxBus = ctx.createGain();
      sfxBus.gain.value = Math.max(0.0001, volume);
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      comp = ctx.createDynamicsCompressor();
      try {
        comp.threshold.value = -14;
        comp.knee.value = 8;
        if (comp.ratio) comp.ratio.value = 6;
        if (comp.attack) comp.attack.value = 0.003;
        if (comp.release) comp.release.value = 0.2;
      } catch (e1) {}
      sfxBus.connect(master);
      master.connect(comp);
      comp.connect(ctx.destination);
      makeNoise();
      flushOverrides();
    } catch (e2) {
      ctx = null;
      return null;
    }
    return ctx;
  }

  function makeNoise() {
    try {
      var len = Math.max(1024, Math.floor(ctx.sampleRate));
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { noiseBuf = null; }
  }

  /* ---------------- 基础 voice ----------------
   * tone(o)：振荡器。o = {t,type,f,f2,dur,a,peak,ft,fq,fq2,q,trem,tremD}
   * rate/pitch 由 CURR/CURP 统一缩放（走带式）。 */
  function tone(o) {
    if (!ctx) return null;
    var osc = null, g = null, fl = null, lfo = null, lg = null, started = false;
    try {
      var R = CURR, P = CURP;
      var t0 = (o.t != null ? o.t : ctx.currentTime);
      var dur = Math.max(0.01, (o.dur || 0.1) / R);
      osc = ctx.createOscillator();
      osc.type = o.type || 'sine';
      var f0 = Math.max(1, (o.f || 440) * R * P);
      osc.frequency.setValueAtTime(f0, t0);
      if (o.f2) {
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(1, o.f2 * R * P), t0 + dur);
      }
      g = ctx.createGain();
      var pk = Math.max(0.0002, o.peak || 0.1);
      var atk = Math.min((o.a != null ? o.a : 0.004) / R, dur * 0.6);
      g.gain.setValueAtTime(0.0002, t0);
      g.gain.exponentialRampToValueAtTime(pk, t0 + atk);
      g.gain.exponentialRampToValueAtTime(0.0002, t0 + dur);
      var nodes = [osc, g];
      if (o.ft) {
        fl = ctx.createBiquadFilter();
        fl.type = o.ft;
        fl.Q.value = o.q || 0.8;
        fl.frequency.setValueAtTime(Math.max(10, (o.fq || 1000) * R * P), t0);
        if (o.fq2) {
          fl.frequency.exponentialRampToValueAtTime(
            Math.max(10, o.fq2 * R * P), t0 + dur);
        }
        osc.connect(fl); fl.connect(g); nodes.push(fl);
      } else {
        osc.connect(g);
      }
      if (o.trem) {
        /* tremolo：LFO 加在 gain 参数上，尾部渐隐避免收尾咔哒 */
        lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = Math.max(0.1, o.trem * R);
        lg = ctx.createGain();
        var dep = pk * (o.tremD != null ? o.tremD : 0.25);
        lg.gain.setValueAtTime(dep, t0);
        lg.gain.setValueAtTime(dep, t0 + dur * 0.6);
        lg.gain.linearRampToValueAtTime(0.0001, t0 + dur);
        lfo.connect(lg); lg.connect(g.gain); nodes.push(lfo, lg);
        lfo.start(t0); lfo.stop(t0 + dur + 0.05);
      }
      g.connect(sfxBus);
      osc.start(t0); started = true;
      osc.stop(t0 + dur + 0.05);
      reg(osc, nodes);
      return osc;
    } catch (e) {
      cleanup([osc, fl, g, lfo, lg], started ? osc : null);
      return null;
    }
  }

  /* nz(o)：噪声 voice。o = {t,dur,a,peak,ft,f,f2,q}（ft: bandpass/lowpass/highpass） */
  function nz(o) {
    if (!ctx || !noiseBuf) return null;
    var src = null, g = null, fl = null, started = false;
    try {
      var R = CURR, P = CURP;
      var t0 = (o.t != null ? o.t : ctx.currentTime);
      var dur = Math.max(0.006, (o.dur || 0.1) / R);
      src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      fl = ctx.createBiquadFilter();
      fl.type = o.ft || 'bandpass';
      fl.Q.value = o.q || 1;
      fl.frequency.setValueAtTime(Math.max(10, (o.f || 1000) * R * P), t0);
      if (o.f2) {
        fl.frequency.exponentialRampToValueAtTime(
          Math.max(10, o.f2 * R * P), t0 + dur);
      }
      g = ctx.createGain();
      var pk = Math.max(0.0002, o.peak || 0.1);
      var atk = Math.min((o.a != null ? o.a : 0.004) / R, dur * 0.5);
      g.gain.setValueAtTime(0.0002, t0);
      g.gain.exponentialRampToValueAtTime(pk, t0 + atk);
      g.gain.exponentialRampToValueAtTime(0.0002, t0 + dur);
      src.connect(fl); fl.connect(g); g.connect(sfxBus);
      src.start(t0, Math.random() * 0.5); started = true;
      src.stop(t0 + dur + 0.05);
      reg(src, [src, fl, g]);
      return src;
    } catch (e) {
      cleanup([src, fl, g], started ? src : null);
      return null;
    }
  }

  /* buffer 覆盖音：playbackRate = rate * pitch */
  function playBuf(buf, vm) {
    var src = null, g = null, started = false;
    try {
      var t0 = ctx.currentTime;
      src = ctx.createBufferSource();
      src.buffer = buf;
      try { src.playbackRate.value = clamp(CURR * CURP, 0.06, 8); } catch (e0) {}
      g = ctx.createGain();
      g.gain.setValueAtTime(clamp(vm, 0, 4), t0);
      src.connect(g); g.connect(sfxBus);
      src.start(t0); started = true;
      reg(src, [src, g]);
      return src;
    } catch (e) {
      cleanup([src, g], started ? src : null);
      return null;
    }
  }

  /* duck：bomb 时压低 sfxBus 让其他音让路，dur 后回到用户音量 */
  function duck(depth, dur) {
    if (!sfxBus || !ctx) return;
    try {
      var t = ctx.currentTime, p = sfxBus.gain;
      p.cancelScheduledValues(t);
      p.setValueAtTime(Math.max(0.0001, volume), t);
      p.linearRampToValueAtTime(Math.max(0.0001, volume * depth), t + 0.03);
      p.linearRampToValueAtTime(Math.max(0.0001, volume), t + dur);
    } catch (e) {}
  }

  /* ================= 音色表 ================= */
  var cues = {};

  /* bounce：碰撞 blip，强度定频率/时长/音量 */
  cues.bounce = function (t, vm, x) {
    var i = (x && typeof x.i === 'number') ? clamp(x.i, 0, 1) : 0.5;
    var f = 320 + 500 * i;
    var dur = 0.12 - 0.06 * i;
    var pk = 0.05 + 0.22 * i;
    tone({ t: t, type: 'triangle', f: f, f2: f * 0.55, dur: dur, a: 0.002, peak: pk * vm });
  };

  /* hit：bumper 命中 = 低频 pluck + 短噪声 click */
  cues.hit = function (t, vm) {
    tone({ t: t, type: 'sine', f: 180, f2: 126, dur: 0.09, a: 0.002, peak: 0.3 * vm });
    nz({ t: t, dur: 0.016, peak: 0.12 * vm, ft: 'highpass', f: 4200, q: 0.7 });
  };

  /* pop：消除爆 = 噪声扫频 + 下滑方波 */
  cues.pop = function (t, vm) {
    nz({ t: t, dur: 0.07, peak: 0.28 * vm, ft: 'bandpass', f: 1800, f2: 420, q: 1 });
    tone({ t: t, type: 'square', f: 660, f2: 220, dur: 0.08, a: 0.002, peak: 0.16 * vm });
  };

  /* swallow：漩涡吸入 = 正弦下扫 + tremolo */
  cues.swallow = function (t, vm) {
    tone({ t: t, type: 'sine', f: 600, f2: 110, dur: 0.3, a: 0.012,
      peak: 0.26 * vm, trem: 9, tremD: 0.3 });
    tone({ t: t, type: 'sine', f: 300, f2: 80, dur: 0.28, a: 0.012, peak: 0.07 * vm });
  };

  /* collect：收球 = 上行三连音 */
  cues.collect = function (t, vm) {
    var fs = [523.25, 659.25, 783.99];
    for (var k = 0; k < 3; k++) {
      tone({ t: t + k * 0.06 / CURR, type: 'triangle', f: fs[k], dur: 0.1,
        a: 0.003, peak: 0.16 * vm });
    }
  };

  /* clear：过关 = 上行五音琶音 + 尾音闪光垫 */
  cues.clear = function (t, vm) {
    var fs = [261.63, 329.63, 392, 523.25, 659.25];
    for (var k = 0; k < 5; k++) {
      tone({ t: t + k * 0.085 / CURR, type: 'triangle', f: fs[k], dur: 0.18,
        a: 0.003, peak: 0.14 * vm });
    }
    tone({ t: t + 0.42 / CURR, type: 'sine', f: 1046.5, dur: 0.5, a: 0.04, peak: 0.05 * vm });
    tone({ t: t + 0.42 / CURR, type: 'sine', f: 1318.5, dur: 0.5, a: 0.04, peak: 0.04 * vm });
  };

  /* bomb：低爆 = 低通噪声 + sub thump + duck */
  cues.bomb = function (t, vm) {
    nz({ t: t, dur: 0.4, peak: 0.5 * vm, ft: 'lowpass', f: 400, f2: 90, q: 0.6 });
    tone({ t: t, type: 'sine', f: 60, f2: 38, dur: 0.32, a: 0.004, peak: 0.55 * vm });
    nz({ t: t, dur: 0.03, peak: 0.14 * vm, ft: 'highpass', f: 3000, q: 0.7 });
    duck(0.3, 0.45);
  };

  /* click：UI 点击 1kHz tick */
  cues.click = function (t, vm) {
    tone({ t: t, type: 'sine', f: 1000, dur: 0.03, a: 0.001, peak: 0.14 * vm });
    nz({ t: t, dur: 0.01, peak: 0.05 * vm, ft: 'highpass', f: 5000, q: 0.7 });
  };

  /* slow：慢动作 whoosh，进入下扫 / 退出上扫（{up:true} 或 slowUp） */
  cues.slow = function (t, vm, x) {
    if (x && (x.up || x.reverse || x.exit)) { cues.slowUp(t, vm); return; }
    nz({ t: t, dur: 0.3, peak: 0.22 * vm, ft: 'bandpass', f: 800, f2: 200, q: 1.2 });
  };
  cues.slowUp = function (t, vm) {
    nz({ t: t, dur: 0.3, peak: 0.22 * vm, ft: 'bandpass', f: 200, f2: 800, q: 1.2 });
  };
  cues.slowOff = cues.slowUp;
  cues.slowReverse = cues.slowUp;

  /* add：加球 = 双音上行 blip */
  cues.add = function (t, vm) {
    tone({ t: t, type: 'triangle', f: 523.25, dur: 0.07, a: 0.002, peak: 0.15 * vm });
    tone({ t: t + 0.07 / CURR, type: 'triangle', f: 783.99, dur: 0.09,
      a: 0.002, peak: 0.17 * vm });
  };

  /* coin/float：浮分轻叮 */
  cues.coin = function (t, vm) {
    tone({ t: t, type: 'sine', f: 1300, dur: 0.05, a: 0.001, peak: 0.12 * vm });
    tone({ t: t, type: 'sine', f: 1950, dur: 0.04, a: 0.001, peak: 0.04 * vm });
  };
  cues.float = function (t, vm) { cues.coin(t, vm * 0.8); };

  /* generic：兜底轻 tick */
  cues.generic = function (t, vm) {
    tone({ t: t, type: 'triangle', f: 900, dur: 0.025, a: 0.001, peak: 0.07 * vm });
  };

  /* ---------------- 手势解锁 ---------------- */
  function bindGestures() {
    if (bound) return;
    bound = true;
    try {
      if (typeof document === 'undefined' || !document.addEventListener) return;
      var h = function () { unlock(); };
      var opt = { passive: true, capture: true };
      document.addEventListener('pointerdown', h, opt);
      document.addEventListener('touchend', h, opt);
      document.addEventListener('keydown', h, opt);
    } catch (e) {}
  }

  function unlock() {
    bindGestures();
    if (!ensureCtx()) return;
    try {
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        var p = ctx.resume();
        if (p && typeof p.catch === 'function') p.catch(function () {});
      }
    } catch (e) {}
  }

  /* ---------------- 覆盖音（applyOverrides） ---------------- */
  function decodeOverride(name, data) {
    if (!ctx) return; /* ctx 未就绪：留在 ovrRaw，init 后 flushOverrides 再解 */
    var ab = null, p = null;
    if (typeof ArrayBuffer !== 'undefined' && data instanceof ArrayBuffer) {
      ab = data;
    } else if (typeof data === 'string' && data.indexOf('data:') === 0 &&
               typeof fetch === 'function') {
      p = fetch(data).then(function (r) { return r.arrayBuffer(); });
    } else if (typeof data === 'string' && data.indexOf('base64,') >= 0 &&
               typeof atob === 'function') {
      try {
        var b64 = data.slice(data.indexOf('base64,') + 7);
        var bin = atob(b64), n = bin.length, u8 = new Uint8Array(n);
        for (var i = 0; i < n; i++) u8[i] = bin.charCodeAt(i);
        ab = u8.buffer;
      } catch (e) { return; }
    } else {
      return; /* 无法识别的类型：静默保留合成音 */
    }
    var doDecode = function (buf) {
      try {
        var r = ctx.decodeAudioData(buf, function (ok) { ovrBuf[name] = ok; },
          function () {});
        if (r && typeof r.then === 'function') {
          r.then(function (ok) { ovrBuf[name] = ok; }, function () {});
        }
      } catch (e2) {}
    };
    if (p) p.then(doDecode, function () {});
    else doDecode(ab);
  }

  function flushOverrides() {
    for (var k in ovrRaw) {
      if (Object.prototype.hasOwnProperty.call(ovrRaw, k)) decodeOverride(k, ovrRaw[k]);
    }
  }

  function applyOverrides(map) {
    if (!map || typeof map !== 'object') return;
    for (var k in map) {
      if (!Object.prototype.hasOwnProperty.call(map, k)) continue;
      var v = map[k];
      if (!v) { delete ovrBuf[k]; delete ovrRaw[k]; continue; }
      ovrRaw[k] = v;
      decodeOverride(k, v);
    }
  }

  /* ---------------- 公开 API ---------------- */
  function init() { bindGestures(); return !!ensureCtx(); }

  function play(name, opts) {
    if (!ensureCtx()) return;
    if (typeof name !== 'string' || !name) name = 'generic';
    var now = ctx.currentTime;
    var lt = lastT[name];
    if (lt != null && now - lt < 0.02) return; /* 同名 20ms 防抖 */
    lastT[name] = now;
    opts = opts || {};
    var vm = clamp(num(opts.vol, 1), 0, 4);
    CURR = clamp(num(opts.rate, 1), 0.1, 8);
    CURP = clamp(num(opts.pitch, 1), 0.05, 8);
    var fn = cues[name] || cues.generic;
    try {
      var buf = ovrBuf[name];
      if (buf) playBuf(buf, vm);
      else fn(now, vm, opts);
    } catch (e) {
      /* 合成出错静默，绝不影响游戏 */
    } finally {
      CURR = 1; CURP = 1;
    }
  }

  function bounce(intensity) {
    if (!ensureCtx()) return;
    var now = ctx.currentTime;
    var lt = lastT.bounce;
    if (lt != null && now - lt < 0.02) return;
    lastT.bounce = now;
    var i = clamp(num(intensity, 0.5), 0, 1);
    try { cues.bounce(now, 1, { i: i }); } catch (e) {}
  }

  function setMuted(m) {
    muted = !!m;
    if (ctx && master) {
      try {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setValueAtTime(muted ? 0 : 1, ctx.currentTime);
      } catch (e) {}
    }
  }

  function setVolume(v) {
    volume = clamp(num(v, 0.8), 0, 1);
    if (ctx && sfxBus) {
      try {
        sfxBus.gain.cancelScheduledValues(ctx.currentTime);
        sfxBus.gain.setValueAtTime(Math.max(0.0001, volume), ctx.currentTime);
      } catch (e) {}
    }
  }

  function stopAll() {
    var a = live.splice(0, live.length);
    for (var i = 0; i < a.length; i++) {
      try { a[i].onended = null; } catch (e1) {}
      try { a[i].stop(0); } catch (e2) {}
    }
    if (ctx && sfxBus) {
      try {
        sfxBus.gain.cancelScheduledValues(ctx.currentTime);
        sfxBus.gain.setValueAtTime(Math.max(0.0001, volume), ctx.currentTime);
      } catch (e3) {}
    }
  }

  var AUDIO = {
    init: init,
    unlock: unlock,
    play: play,
    bounce: bounce,
    setMuted: setMuted,
    setVolume: setVolume,
    applyOverrides: applyOverrides,
    stopAll: stopAll
  };
  try {
    Object.defineProperty(AUDIO, 'muted', {
      get: function () { return muted; }, configurable: true
    });
    Object.defineProperty(AUDIO, 'volume', {
      get: function () { return volume; }, configurable: true
    });
  } catch (e) {}

  if (global && typeof global === 'object') {
    if (!global.GP) global.GP = {};
    global.GP.AUDIO = AUDIO;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AUDIO;
  }
})(typeof window !== 'undefined' ? window
  : (typeof globalThis !== 'undefined' ? globalThis : this));
