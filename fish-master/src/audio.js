/*
 * 捕鱼达人 · DEEP SEA ANGLER — 程序化音频模块
 * 纯 WebAudio 合成，零外部音频文件 / fetch / CDN。
 * 仅挂载 window.FM.AUDIO，按契约实现 unlock/play/startLoop/stopLoop/
 * stopAllLoops/setMuted/isMuted/setVolume/names。
 */
(function () {
  'use strict';

  // 浏览器环境缺失时静默降级，不抛错
  if (typeof window === 'undefined') return;
  window.FM = window.FM || {};

  window.FM.AUDIO = (function () {
    // ---------- 常量 ----------
    var CUES = ['shoot', 'catch', 'coin', 'bomb', 'combo', 'click', 'start', 'levelup', 'ambient'];
    var MAX_VOICES = 28;          // 同时发声上限：shoot 每 0.3s 一次，防止叠加爆音
    var AMBIENT_VOL = 0.12;       // ambient 默认音量（契约规定极低）

    // ---------- 运行状态 ----------
    var ctx = null;               // AudioContext 惰性创建
    var master = null;            // 总输出增益（静音 / 音量在此真实生效）
    var unlocked = false;
    var muted = false;
    var masterVolume = 1;
    var activeVoices = 0;         // 当前一次性发声节点计数
    var noiseBuf = null;          // 噪声缓冲复用
    var visibilityBound = false;
    var loops = Object.create(null); // 循环注册表：name -> loopObj

    // ---------- 基础设施 ----------

    // 惰性创建 AudioContext；任何 API 缺失都返回 false
    function ensureCtx() {
      if (ctx) return true;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : masterVolume;
        master.connect(ctx.destination);
        bindVisibility();
        return true;
      } catch (e) {
        ctx = null;
        master = null;
        return false;
      }
    }

    // 上下文是否可用于发声（未创建 / 已关闭 / 挂起时不排程，避免恢复瞬间爆音）
    function ready() {
      if (!ctx || !master) return false;
      var s = ctx.state;
      return !s || s === 'running';
    }

    // 幂等解锁：首次用户手势 resume，后续调用不再重复创建
    function unlock() {
      if (unlocked) {
        // 若上下文被浏览器再次挂起（切后台回来），尝试恢复一次
        if (ctx && ctx.state && ctx.state !== 'running' && ctx.state !== 'closed') {
          try {
            var p1 = ctx.resume();
            if (p1 && typeof p1.catch === 'function') p1.catch(function () {});
          } catch (e) {}
        }
        return;
      }
      if (!ensureCtx()) return;
      unlocked = true;
      try {
        var p = ctx.resume();
        if (p && typeof p.catch === 'function') p.catch(function () {});
      } catch (e) {}
    }

    // ADSR 简化包络：短 attack / 可选 hold / 指数 release，避免爆音
    function applyEnv(g, t0, attack, hold, release, peak) {
      peak = Math.max(0.0002, peak || 0);
      var param = g.gain;
      param.setValueAtTime(0.0001, t0);
      param.linearRampToValueAtTime(peak, t0 + attack);
      var holdEnd = t0 + attack + hold;
      if (hold > 0) param.setValueAtTime(peak, holdEnd);
      param.exponentialRampToValueAtTime(0.0001, holdEnd + release);
    }

    // 节点生命周期：结束后 stop + disconnect，并递减发声计数
    function track(source, nodes, stopAt) {
      activeVoices++;
      source.onended = function () {
        try { source.disconnect(); } catch (e) {}
        for (var i = 0; i < nodes.length; i++) {
          try { nodes[i].disconnect(); } catch (e) {}
        }
        activeVoices = Math.max(0, activeVoices - 1);
      };
      try { source.stop(stopAt); } catch (e) {}
    }

    // 生成一段振荡器音（可选频率扫频），接入 dest（默认 master）
    function tone(o) {
      var osc = ctx.createOscillator();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(o.freq, o.t0);
      if (o.freqEnd != null) {
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(1, o.freqEnd), o.t0 + (o.sweepTime || o.attack + o.hold + o.release)
        );
      }
      if (o.detune) {
        try { osc.detune.setValueAtTime(o.detune, o.t0); } catch (e) {}
      }
      var g = ctx.createGain();
      applyEnv(g, o.t0, o.attack, o.hold || 0, o.release, o.peak);
      osc.connect(g);
      g.connect(o.dest || master);
      osc.start(o.t0);
      var end = o.t0 + o.attack + (o.hold || 0) + o.release + 0.03;
      track(osc, [g], end);
      return g;
    }

    // 复用一段 1 秒白噪声缓冲（避免每次重建）
    function getNoiseBuffer() {
      if (noiseBuf) return noiseBuf;
      try {
        var len = Math.max(1, Math.floor((ctx.sampleRate || 44100) * 1));
        noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate || 44100);
        var data = noiseBuf.getChannelData(0);
        for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      } catch (e) {
        noiseBuf = null;
      }
      return noiseBuf;
    }

    // 生成一段噪声（可经滤波扫频），用于爆炸 / 气泡质感
    function noise(o) {
      var buf = getNoiseBuffer();
      if (!buf) return;
      var src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      var g = ctx.createGain();
      applyEnv(g, o.t0, o.attack, o.hold || 0, o.release, o.peak);
      var nodes = [g];
      var last = g;
      if (o.filter) {
        var f = ctx.createBiquadFilter();
        f.type = o.filter.type || 'lowpass';
        f.frequency.setValueAtTime(o.filter.freq, o.t0);
        if (o.filter.freqEnd != null) {
          f.frequency.exponentialRampToValueAtTime(
            Math.max(20, o.filter.freqEnd), o.t0 + (o.filter.sweepTime || o.release)
          );
        }
        if (o.filter.Q != null) {
          try { f.Q.value = o.filter.Q; } catch (e) {}
        }
        last.connect(f);
        last = f;
        nodes.push(f);
      }
      last.connect(o.dest || master);
      src.connect(g);
      src.start(o.t0);
      var end = o.t0 + o.attack + (o.hold || 0) + o.release + 0.03;
      track(src, nodes, end);
    }

    // ---------- 各音效合成 ----------

    // shoot：水下闷响（低频下滑）+ 轻微气泡上浮，轻量短促
    function sfxShoot(t, v, r) {
      tone({ type: 'sine', freq: 170 * r, freqEnd: 62 * r, sweepTime: 0.11,
             t0: t, attack: 0.004, hold: 0.008, release: 0.11, peak: 0.42 * v });
      tone({ type: 'sine', freq: 430 * r, freqEnd: 840 * r, sweepTime: 0.09,
             t0: t + 0.008, attack: 0.003, hold: 0, release: 0.085, peak: 0.1 * v });
    }

    // catch：清脆水润的三音上行铃音（正弦 + 八度泛音）
    function sfxCatch(t, v, r) {
      var notes = [523.25, 659.25, 783.99];
      for (var i = 0; i < 3; i++) {
        var at = t + i * 0.07;
        tone({ type: 'triangle', freq: notes[i] * r, t0: at,
               attack: 0.004, hold: 0.012, release: 0.22, peak: 0.26 * v });
        tone({ type: 'sine', freq: notes[i] * 2 * r, t0: at,
               attack: 0.003, hold: 0.005, release: 0.12, peak: 0.07 * v });
      }
    }

    // coin：短促高频金属叮
    function sfxCoin(t, v, r) {
      tone({ type: 'sine', freq: 1568 * r, t0: t,
             attack: 0.002, hold: 0.006, release: 0.18, peak: 0.24 * v });
      tone({ type: 'sine', freq: 2349 * r, t0: t,
             attack: 0.002, hold: 0.003, release: 0.11, peak: 0.1 * v });
    }

    // bomb：低频轰鸣 + 噪声低通扫频下坠 + 高频爆裂
    function sfxBomb(t, v, r) {
      tone({ type: 'sine', freq: 105 * r, freqEnd: 32 * r, sweepTime: 0.5,
             t0: t, attack: 0.006, hold: 0.02, release: 0.5, peak: 0.62 * v });
      noise({ t0: t, attack: 0.01, hold: 0.03, release: 0.5, peak: 0.45 * v,
              filter: { type: 'lowpass', freq: 1800, freqEnd: 120, sweepTime: 0.5, Q: 1 } });
      noise({ t0: t, attack: 0.001, hold: 0.004, release: 0.12, peak: 0.2 * v,
              filter: { type: 'highpass', freq: 3200 } });
    }

    // combo：明亮上行闪光音
    function sfxCombo(t, v, r) {
      var notes = [659.25, 880, 1174.66];
      for (var i = 0; i < 3; i++) {
        tone({ type: 'triangle', freq: notes[i] * r, t0: t + i * 0.05,
               attack: 0.003, hold: 0.01, release: 0.16, peak: 0.2 * v });
      }
      tone({ type: 'sine', freq: 420 * r, freqEnd: 1600 * r, sweepTime: 0.22,
             t0: t, attack: 0.01, hold: 0.02, release: 0.18, peak: 0.09 * v });
    }

    // click：UI 轻点
    function sfxClick(t, v, r) {
      tone({ type: 'triangle', freq: 900 * r, freqEnd: 520 * r, sweepTime: 0.05,
             t0: t, attack: 0.002, hold: 0.004, release: 0.045, peak: 0.16 * v });
    }

    // start：柔和上行铺底
    function sfxStart(t, v, r) {
      var notes = [392, 523.25, 659.25];
      for (var i = 0; i < 3; i++) {
        tone({ type: 'sine', freq: notes[i] * r, t0: t + i * 0.12,
               attack: 0.06, hold: 0.05, release: 0.34, peak: 0.16 * v });
      }
    }

    // levelup：庆祝式小琶音
    function sfxLevelup(t, v, r) {
      var notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
      for (var i = 0; i < notes.length; i++) {
        var at = t + i * 0.075;
        tone({ type: 'triangle', freq: notes[i] * r, t0: at,
               attack: 0.004, hold: 0.02, release: 0.24, peak: 0.23 * v });
        tone({ type: 'sine', freq: notes[i] * 2 * r, t0: at,
               attack: 0.003, hold: 0.008, release: 0.12, peak: 0.06 * v });
      }
    }

    // ---------- ambient 循环 ----------

    function makeAmbient(loop) {
      var t = ctx.currentTime + 0.02;

      // outGain 统一控制淡入 / 可见性暂停 / 停止淡出
      var out = ctx.createGain();
      out.gain.setValueAtTime(0.0001, t);
      out.gain.linearRampToValueAtTime(loop.targetVol, t + 1.0);
      out.connect(master);
      loop.outGain = out;

      // 低通滤波，营造水下闷感
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 240;
      try { lp.Q.value = 0.5; } catch (e) {}
      lp.connect(out);

      // drone 汇流 + 缓慢 LFO 起伏（像水流）
      var drone = ctx.createGain();
      drone.gain.value = 1.0;
      drone.connect(lp);

      var oscs = [];
      var freqs = [55, 82.41, 110];
      var gains = [0.6, 0.35, 0.15];
      for (var i = 0; i < freqs.length; i++) {
        var o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = freqs[i];
        try { o.detune.value = (i - 1) * 5; } catch (e) {}
        var og = ctx.createGain();
        og.gain.value = gains[i];
        o.connect(og);
        og.connect(drone);
        o.start(t);
        oscs.push(o);
        loop.nodes.push(og);
      }

      var lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.1;
      var lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.3;
      lfo.connect(lfoGain);
      lfoGain.connect(drone.gain);
      lfo.start(t);
      oscs.push(lfo);
      loop.nodes.push(lfoGain);

      loop.sources = oscs;
      loop.nodes.push(out, lp, drone);

      // 偶发气泡：定时器随机跳过，接到 out 上随可见性一起静音
      loop.bubbleTimer = setInterval(function () {
        if (loop.stopped || !ctx || ctx.state === 'closed') return;
        if (typeof document !== 'undefined' && document.hidden) return;
        if (activeVoices > MAX_VOICES) return;
        if (Math.random() < 0.55) return;
        var bt = ctx.currentTime + 0.01;
        var f = 300 + Math.random() * 380;
        tone({ type: 'sine', freq: f, freqEnd: f * 1.8, sweepTime: 0.12,
               t0: bt, attack: 0.005, hold: 0, release: 0.12, peak: 0.045, dest: out });
      }, 1100);
    }

    // 页面切后台时把 ambient 淡出 / 恢复（不改其他音效）
    function setAmbientPaused(paused) {
      var loop = loops.ambient;
      if (!loop || !ctx || !loop.outGain) return;
      var g = loop.outGain.gain;
      var t = ctx.currentTime;
      var cur = 0.0001;
      try { cur = Math.max(0.0001, g.value); } catch (e) {}
      g.cancelScheduledValues(t);
      g.setValueAtTime(cur, t);
      g.linearRampToValueAtTime(paused ? 0.0001 : loop.targetVol, t + 0.3);
    }

    function bindVisibility() {
      if (visibilityBound || typeof document === 'undefined' || !document.addEventListener) return;
      visibilityBound = true;
      try {
        document.addEventListener('visibilitychange', function () {
          setAmbientPaused(!!document.hidden);
        });
      } catch (e) {}
    }

    function startLoop(name) {
      if (name !== 'ambient') return false; // 当前仅 ambient 为循环型
      if (loops.ambient) return true;        // 幂等，不重复启动
      if (!ensureCtx()) return false;
      var loop = {
        name: 'ambient',
        targetVol: AMBIENT_VOL,
        sources: [], nodes: [], stopped: false,
        outGain: null, bubbleTimer: null
      };
      loops.ambient = loop;
      makeAmbient(loop);
      if (typeof document !== 'undefined' && document.hidden) setAmbientPaused(true);
      return true;
    }

    function stopLoop(name) {
      var loop = loops[name];
      if (!loop) return false;
      loop.stopped = true;
      if (loop.bubbleTimer) {
        try { clearInterval(loop.bubbleTimer); } catch (e) {}
        loop.bubbleTimer = null;
      }
      if (ctx) {
        var t = ctx.currentTime;
        if (loop.outGain) {
          var g = loop.outGain.gain;
          var cur = 0.0001;
          try { cur = Math.max(0.0001, g.value); } catch (e) {}
          g.cancelScheduledValues(t);
          g.setValueAtTime(cur, t);
          g.linearRampToValueAtTime(0.0001, t + 0.15);
        }
        var stopAt = t + 0.2;
        for (var i = 0; i < loop.sources.length; i++) {
          (function (s) {
            s.onended = function () {
              try { s.disconnect(); } catch (e) {}
              for (var j = 0; j < loop.nodes.length; j++) {
                try { loop.nodes[j].disconnect(); } catch (e) {}
              }
            };
            try { s.stop(stopAt); } catch (e) {}
          })(loop.sources[i]);
        }
      }
      delete loops[name];
      return true;
    }

    function stopAllLoops() {
      var names = Object.keys(loops);
      for (var i = 0; i < names.length; i++) stopLoop(names[i]);
    }

    // ---------- 对外接口 ----------

    function play(name, opts) {
      opts = opts || {};
      if (CUES.indexOf(name) < 0) return false;
      var v = (typeof opts.volume === 'number') ? opts.volume : 1;
      var r = (typeof opts.rate === 'number' && opts.rate > 0) ? opts.rate : 1;
      if (!ensureCtx() || !ready()) return false;
      // ambient 是循环型：不受一次性音效的静音跳过 / 并发上限影响，
      // 静音由 master 增益统一处理，故此处先于二者分派。
      if (name === 'ambient') return startLoop('ambient');
      if (muted) return false;                       // 静音时直接跳过一次性音效
      if (activeVoices > MAX_VOICES) return false;   // 限制同时发声，防止爆音

      var t = ctx.currentTime + 0.005;
      switch (name) {
        case 'shoot':   sfxShoot(t, v, r); break;
        case 'catch':   sfxCatch(t, v, r); break;
        case 'coin':    sfxCoin(t, v, r); break;
        case 'bomb':    sfxBomb(t, v, r); break;
        case 'combo':   sfxCombo(t, v, r); break;
        case 'click':   sfxClick(t, v, r); break;
        case 'start':   sfxStart(t, v, r); break;
        case 'levelup': sfxLevelup(t, v, r); break;
        default: return false;
      }
      return true;
    }

    function setMuted(v) {
      muted = !!v;
      if (ctx && master) {
        var t = ctx.currentTime;
        var cur = 0;
        try { cur = master.gain.value; } catch (e) {}
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(cur, t);
        master.gain.linearRampToValueAtTime(muted ? 0 : masterVolume, t + 0.02);
      }
    }

    function isMuted() {
      return muted;
    }

    function setVolume(v) {
      v = Number(v);
      if (!isFinite(v)) return;
      masterVolume = Math.max(0, Math.min(1, v));
      if (ctx && master && !muted) {
        var t = ctx.currentTime;
        var cur = 0;
        try { cur = master.gain.value; } catch (e) {}
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(cur, t);
        master.gain.linearRampToValueAtTime(masterVolume, t + 0.02);
      }
    }

    var api = {
      unlock: unlock,
      play: play,
      startLoop: startLoop,
      stopLoop: stopLoop,
      stopAllLoops: stopAllLoops,
      setMuted: setMuted,
      isMuted: isMuted,
      setVolume: setVolume,
      names: CUES.slice()
    };
    return api;
  })();
})();
