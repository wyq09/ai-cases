/* eslint-disable */
// 填成语 · 音效模块（代理B）
// 全 WebAudio 程序化合成，零外部文件。中国风柔和拨弦（古筝/琵琶质感）+ 木鱼短点。
// 接口（契约 §2）：
//   CY.audio = { init, unlock, play(name), setVol({master,sfx,bgm}),
//                applyOverrides(map), startBgm(), stopBgm(), _lastPlayed }
// node 环境（无 window/AudioContext）加载与调用均安全降级，不抛错。
(function (root) {
  'use strict';

  // ---------- 状态 ----------
  var S = {
    ctx: null,          // AudioContext（懒建）
    master: null,       // 主通道增益
    sfx: null,          // 音效通道增益
    bgm: null,          // 背景音乐通道增益
    vol: { master: 0.9, sfx: 0.8, bgm: 0.25 }, // 与契约 config.audio 默认一致
    muted: false,
    bgmOn: false,       // 主线 startBgm() 后为 true，stopBgm()/静音时暂停
    hidden: false,
    bgmTimer: null,
    visInstalled: false
  };

  // 五声音阶（宫商角徵羽 = C D E G A）常用音高
  var NOTE = {
    C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.00, A4: 440.00,
    C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.00,
    C6: 1046.50, D6: 1174.66, E6: 1318.51, G6: 1567.98, A6: 1760.00
  };
  var BGM_POOL = [NOTE.C4, NOTE.D4, NOTE.E4, NOTE.G4, NOTE.A4, NOTE.C5, NOTE.D5, NOTE.E5];

  // ---------- 工具 ----------
  function getAC() {
    if (typeof window === 'undefined') return null;
    return window.AudioContext || window.webkitAudioContext || null;
  }
  function clamp01(v) {
    v = Number(v);
    if (isNaN(v)) return 0;
    return Math.min(1, Math.max(0, v));
  }

  function applyGains(smooth) {
    if (!S.ctx) return;
    var t = S.ctx.currentTime;
    try {
      if (smooth && S.master.gain.setTargetAtTime) {
        S.master.gain.setTargetAtTime(S.muted ? 0 : S.vol.master, t, 0.02);
        S.sfx.gain.setTargetAtTime(S.vol.sfx, t, 0.02);
        S.bgm.gain.setTargetAtTime(S.vol.bgm, t, 0.02);
      } else {
        S.master.gain.value = S.muted ? 0 : S.vol.master;
        S.sfx.gain.value = S.vol.sfx;
        S.bgm.gain.value = S.vol.bgm;
      }
    } catch (err) { /* 降级 */ }
  }

  // ---------- 合成基元 ----------

  // 拨弦（古筝/琵琶质感）：多泛音正弦 + 低通扫频 + 指甲瞬态噪声
  function pluck(dest, freq, t0, dur, peak, bendCents, withAttack) {
    var e = S.ctx;
    if (!e || !dest) return;
    var g = e.createGain();
    var lp = e.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.6;
    var fStart = Math.min(freq * 9, 8500);
    var fEnd = Math.max(Math.min(freq * 2.2, 4200), 80);
    lp.frequency.setValueAtTime(fStart, t0);
    lp.frequency.exponentialRampToValueAtTime(fEnd, t0 + dur * 0.85);

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.007);
    g.gain.exponentialRampToValueAtTime(0.0006, t0 + dur);

    g.connect(lp);
    lp.connect(dest);

    var PARTIALS = [[1, 1.0], [2, 0.40], [3, 0.15], [4.02, 0.06]];
    for (var i = 0; i < PARTIALS.length; i++) {
      var mult = PARTIALS[i][0], amt = PARTIALS[i][1];
      var o = e.createOscillator();
      o.type = 'sine';
      var f = freq * mult;
      o.frequency.setValueAtTime(f, t0);
      if (bendCents) { // 负值 = 轻微下滑（叹气感）
        o.frequency.exponentialRampToValueAtTime(f * Math.pow(2, bendCents / 1200), t0 + dur);
      }
      var og = e.createGain();
      og.gain.value = amt;
      o.connect(og);
      og.connect(g);
      o.start(t0);
      o.stop(t0 + dur + 0.06);
    }
    if (withAttack) {
      attackNoise(dest, Math.min(freq * 3.2, 6500), t0, Math.min(peak * 0.22, 0.12));
    }
  }

  // 拨弦起振的指甲瞬态（极短带通噪声）
  function attackNoise(dest, freq, t0, amt) {
    var e = S.ctx;
    if (!e || !dest || amt <= 0) return;
    var n = Math.max(64, Math.floor(e.sampleRate * 0.018));
    var buf = e.createBuffer(1, n, e.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = e.createBufferSource();
    src.buffer = buf;
    var bp = e.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 1.1;
    var g = e.createGain();
    g.gain.setValueAtTime(amt, t0);
    g.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.025);
    src.connect(bp);
    bp.connect(g);
    g.connect(dest);
    src.start(t0);
  }

  // 柔和噪声洗（用于 wrong 的轻微噪声层）
  function noiseWash(dest, freq, t0, dur, amt) {
    var e = S.ctx;
    if (!e || !dest || amt <= 0) return;
    var n = Math.max(64, Math.floor(e.sampleRate * dur));
    var buf = e.createBuffer(1, n, e.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) {
      var k = 1 - i / n;
      d[i] = (Math.random() * 2 - 1) * k * k;
    }
    var src = e.createBufferSource();
    src.buffer = buf;
    var lp = e.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = freq;
    var g = e.createGain();
    g.gain.setValueAtTime(amt, t0);
    g.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
    src.connect(lp);
    lp.connect(g);
    g.connect(dest);
    src.start(t0);
  }

  // 铃（加分音列的高频泛音，清而不刺）
  function bellTone(dest, freq, t0, dur, peak) {
    var e = S.ctx;
    if (!e || !dest) return;
    var g = e.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
    g.connect(dest);
    var PARTS = [[1, 1.0], [2.756, 0.32], [5.404, 0.10], [8.933, 0.04]];
    for (var i = 0; i < PARTS.length; i++) {
      var o = e.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq * PARTS[i][0], t0);
      var og = e.createGain();
      og.gain.value = PARTS[i][1];
      o.connect(og);
      og.connect(g);
      o.start(t0);
      o.stop(t0 + dur + 0.06);
    }
  }

  // ---------- 具体音效 ----------

  // tap：木鱼式极短轻点（约 50ms，柔和）
  function sTap(t0) {
    var dest = S.sfx;
    var o = S.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(1150, t0);
    o.frequency.exponentialRampToValueAtTime(780, t0 + 0.04);
    var g = S.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.30, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.05);
    o.connect(g);
    g.connect(dest);
    o.start(t0);
    o.stop(t0 + 0.09);
    attackNoise(dest, 2600, t0, 0.05);
  }

  // wrong：低频闷响 + 轻微噪声（约 150ms，不刺耳）
  function sWrong(t0) {
    var dest = S.sfx;
    var o = S.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(165, t0);
    o.frequency.exponentialRampToValueAtTime(105, t0 + 0.13);
    var lp = S.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    lp.Q.value = 0.5;
    var g = S.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.50, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.15);
    o.connect(lp);
    lp.connect(g);
    g.connect(dest);
    o.start(t0);
    o.stop(t0 + 0.2);
    noiseWash(dest, 320, t0, 0.09, 0.10);
  }

  // correct：宫→徵 双音上行拨弦（C5→G5）
  function sCorrect(t0) {
    pluck(S.sfx, NOTE.C5, t0, 0.7, 0.50, 0, true);
    pluck(S.sfx, NOTE.G5, t0 + 0.09, 0.95, 0.55, 0, true);
  }

  // milestone：两记高音铃 + 短琶音（金币到账感）
  function sMilestone(t0) {
    bellTone(S.sfx, NOTE.C6, t0, 0.5, 0.32);
    bellTone(S.sfx, NOTE.E6, t0 + 0.11, 0.5, 0.30);
    var arp = [NOTE.G5, NOTE.A5, NOTE.C6, NOTE.E6];
    for (var i = 0; i < arp.length; i++) {
      pluck(S.sfx, arp[i], t0 + 0.26 + i * 0.06, 0.55, 0.26, 0, false);
    }
  }

  // win：五声音阶四音上行 + 高八度长尾音（衰减尾音模拟混响感）
  function sWin(t0) {
    var seq = [NOTE.C5, NOTE.D5, NOTE.E5, NOTE.G5];
    for (var i = 0; i < seq.length; i++) {
      pluck(S.sfx, seq[i], t0 + i * 0.12, 0.6, 0.45, 0, true);
    }
    pluck(S.sfx, NOTE.C6, t0 + 0.5, 1.7, 0.30, 0, false); // 长衰减收尾
    pluck(S.sfx, NOTE.G5, t0 + 0.52, 1.4, 0.18, 0, false);
  }

  // fail：下行两音轻叹（徵→角，带下滑音头）
  function sFail(t0) {
    pluck(S.sfx, NOTE.G4, t0, 0.7, 0.38, -50, false);
    pluck(S.sfx, NOTE.E4, t0 + 0.24, 1.0, 0.34, -70, false);
  }

  // coin：清脆高频短叮
  function sCoin(t0) {
    bellTone(S.sfx, NOTE.G6, t0, 0.28, 0.30);
    attackNoise(S.sfx, 5200, t0, 0.04);
  }

  // hint：星光三连高音（快速上行）
  function sHint(t0) {
    var seq = [NOTE.C6, NOTE.E6, NOTE.G6];
    for (var i = 0; i < seq.length; i++) {
      bellTone(S.sfx, seq[i], t0 + i * 0.06, 0.3, 0.22);
    }
  }

  var SFX = {
    tap: sTap,
    correct: sCorrect,
    wrong: sWrong,
    milestone: sMilestone,
    win: sWin,
    fail: sFail,
    coin: sCoin,
    hint: sHint
  };

  // ---------- BGM ----------
  // 极轻的古风五声音阶拨弦循环：随机宫商角徵羽 + 长衰减，间隔 0.6~1.2s，默认音量很低。
  function playBgmNote() {
    if (!S.ctx || !S.bgm || S.muted) return;
    var t0 = S.ctx.currentTime + 0.02;
    var f = BGM_POOL[Math.floor(Math.random() * BGM_POOL.length)];
    pluck(S.bgm, f, t0, 1.5 + Math.random() * 1.0, 0.22, 0, false);
    if (Math.random() < 0.3) { // 偶尔纯五度点缀，古筝轮指感
      pluck(S.bgm, f * 1.5, t0 + 0.07, 1.3 + Math.random(), 0.12, 0, false);
    }
  }

  function pauseBgm() {
    if (S.bgmTimer != null) {
      clearTimeout(S.bgmTimer);
      S.bgmTimer = null;
    }
  }

  function scheduleBgm() {
    if (!S.ctx || !S.bgmOn || S.muted || S.hidden) return;
    pauseBgm();
    S.bgmTimer = setTimeout(function () {
      S.bgmTimer = null;
      playBgmNote();
      scheduleBgm();
    }, 600 + Math.floor(Math.random() * 600));
  }

  function onVisibility() {
    if (typeof document === 'undefined') return;
    S.hidden = !!document.hidden;
    if (S.hidden) {
      pauseBgm(); // hidden 停 BGM
    } else if (S.bgmOn && !S.muted) {
      scheduleBgm(); // visible 且未静音时恢复
    }
  }

  // ---------- 对外接口 ----------

  function init() {
    if (S.ctx) { applyGains(false); return; }
    var AC = getAC();
    if (!AC) return; // node / 老环境：安全降级
    try {
      S.ctx = new AC();
    } catch (err) {
      S.ctx = null;
      return;
    }
    if (!S.ctx || !S.ctx.createGain) { S.ctx = null; return; }
    S.master = S.ctx.createGain();
    S.sfx = S.ctx.createGain();
    S.bgm = S.ctx.createGain();
    S.sfx.connect(S.master);
    S.bgm.connect(S.master);
    S.master.connect(S.ctx.destination);
    S.hidden = (typeof document !== 'undefined') ? !!document.hidden : false;
    applyGains(false);
    if (!S.visInstalled && typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', onVisibility);
      S.visInstalled = true;
    }
  }

  // 幂等：重复调用无副作用；恢复 suspended context
  function unlock() {
    if (!S.ctx) init();
    if (S.ctx && S.ctx.state === 'suspended' && typeof S.ctx.resume === 'function') {
      try {
        var p = S.ctx.resume();
        if (p && typeof p.catch === 'function') p.catch(function () {});
      } catch (err) { /* 降级 */ }
    }
  }

  // 未知名字安全 no-op；_lastPlayed 记录最近一次合法播放名
  function play(name) {
    var fn = SFX[name];
    if (!fn) return; // 未知名：纯 no-op，不动 _lastPlayed
    audio._lastPlayed = name;
    if (!S.ctx) init();
    if (!S.ctx || S.muted) return; // node / 静音：安全降级
    try {
      if (S.ctx.state === 'suspended' && typeof S.ctx.resume === 'function') {
        var p = S.ctx.resume();
        if (p && typeof p.catch === 'function') p.catch(function () {});
      }
    } catch (err) { /* 降级 */ }
    try {
      fn(S.ctx.currentTime + 0.015);
    } catch (err) { /* 合成失败不影响游戏 */ }
  }

  function setVol(v) {
    if (!v || typeof v !== 'object') return;
    if (typeof v.master === 'number') S.vol.master = clamp01(v.master);
    if (typeof v.sfx === 'number') S.vol.sfx = clamp01(v.sfx);
    if (typeof v.bgm === 'number') S.vol.bgm = clamp01(v.bgm);
    applyGains(true);
  }

  // {muted:true} 全部静音（master 归零 + BGM 暂停）；muted:false 恢复
  function applyOverrides(map) {
    if (!map || typeof map !== 'object') return;
    if (typeof map.muted === 'boolean') {
      S.muted = map.muted;
      applyGains(true);
      if (S.muted) {
        pauseBgm();
      } else if (S.bgmOn && !S.hidden) {
        scheduleBgm();
      }
    }
  }

  // BGM 起播由主线在 init 后决定时调用；node 环境仅记账不发声
  function startBgm() {
    S.bgmOn = true;
    if (!S.ctx) init();
    if (!S.ctx) return;
    if (!S.muted && !S.hidden) {
      playBgmNote();
      scheduleBgm();
    }
  }

  function stopBgm() {
    S.bgmOn = false;
    pauseBgm();
  }

  var audio = {
    _lastPlayed: null,
    init: init,
    unlock: unlock,
    play: play,
    setVol: setVol,
    applyOverrides: applyOverrides,
    startBgm: startBgm,
    stopBgm: stopBgm
  };

  root.CY = root.CY || {};
  root.CY.audio = audio;
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window : globalThis).CY.audio;
}
