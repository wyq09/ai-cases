window.SP=window.SP||{}; SP.AUDIO=(()=>{
'use strict';

/* 木质卡通数字滑块拼图 — WebAudio 程序化音效
 * cue: button/move/denied/shuffle/hint/snap/win
 * 全部合成，零外部资源；支持 applyOverrides({cue:dataURL}) 换自定义音效。
 */

const NAMES = ['button', 'move', 'denied', 'shuffle', 'hint', 'snap', 'win'];

let ctx = null;        // AudioContext，惰性创建
let master = null;     // 总音量总线
let volume = 0.9;      // 对应 cfg.vols.sfx 默认值
let muted = false;
let noiseBuf = null;   // 共享白噪声缓存（AudioBuffer 可复用，非节点）
const buffers = {};    // cue -> AudioBuffer（override 解码成功）
const pending = {};    // cue -> dataURL（待解码/已提交）

/* ---------- 基础 ---------- */

function ensureCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try { ctx = new AC(); } catch (e) { return null; }
  master = ctx.createGain();
  master.gain.value = busGain();
  master.connect(ctx.destination);
  for (const k in pending) decodeCue(k); // 补解码 ctx 创建前提交的 override
  return ctx;
}

function busGain() { return muted ? 0 : volume; }

function applyBus() {
  if (!master) return;
  const g = master.gain;
  if (g.setTargetAtTime) g.setTargetAtTime(busGain(), ctx.currentTime, 0.008);
  else g.value = busGain();
}

function resume() {
  if (!ctx || !ctx.resume) return;
  try {
    const p = ctx.resume(); // running 上下文上是无害 no-op
    if (p && p.catch) p.catch(() => {});
  } catch (e) {}
}

function unlock() { // 幂等：首次手势调用，重复调用无害
  const c = ensureCtx();
  if (c) resume();
}

/* 用完即弃：源节点 onended 时 disconnect 整条链 */
function gcOn(src, nodes) {
  src.onended = () => {
    for (let i = 0; i < nodes.length; i++) {
      try { nodes[i].disconnect(); } catch (e) {}
    }
  };
}

function getNoise() {
  if (noiseBuf) return noiseBuf;
  const len = Math.floor(ctx.sampleRate * 0.5);
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

/* ---------- 合成基元 ---------- */

// 单音：osc(type, f0→f1) + 攻击/指数衰减包络 → master
function tone(t0, o) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.f0, t0);
  if (o.f1 && o.f1 !== o.f0) osc.frequency.exponentialRampToValueAtTime(o.f1, t0 + o.dur);
  const a = o.attack || 0.002;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(o.peak, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.01);
  gcOn(osc, [osc, g]);
}

// 噪声脉冲：buffer 源 + 滤波器 + 包络 → master
function noise(t0, o) {
  const src = ctx.createBufferSource();
  src.buffer = getNoise();
  const f = ctx.createBiquadFilter();
  f.type = o.filter || 'lowpass';
  f.frequency.setValueAtTime(o.freq, t0);
  if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t0 + o.dur);
  if (o.q) f.Q.value = o.q;
  const g = ctx.createGain();
  const a = o.attack || 0.001;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(o.peak, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t0, Math.random() * 0.3); // 随机取样起点，避免每次波形雷同
  src.stop(t0 + o.dur + 0.01);
  gcOn(src, [src, f, g]);
}

// 木块 tock：190Hz 正弦下滑 + 倍频木质感泛音 + 低通噪声
function tock(t0, pitch, k) {
  tone(t0, { f0: pitch, f1: pitch * 0.82, dur: 0.07, peak: 0.5 * k, attack: 0.002 });
  tone(t0, { f0: pitch * 2, dur: 0.045, peak: 0.12 * k });
  noise(t0, { dur: 0.05, filter: 'lowpass', freq: 780, peak: 0.32 * k });
}

// 双音 chime：基频 + 八度泛音，柔和上行
function chime(t0, f, dur, peak) {
  tone(t0, { f0: f, dur: dur, peak: peak, attack: 0.004 });
  tone(t0, { f0: f * 2, dur: dur * 0.6, peak: peak * 0.25, attack: 0.003 });
}

// 木琴音符：基频 + 3 倍非谐泛音（快衰）+ 高频敲击瞬态
function xylo(t0, f, peak, dur) {
  dur = dur || 0.4;
  tone(t0, { f0: f, dur: dur, peak: peak, attack: 0.002 });
  tone(t0, { f0: f * 3, dur: dur * 0.35, peak: peak * 0.28, attack: 0.001 });
  noise(t0, { dur: 0.01, filter: 'highpass', freq: 3000, peak: peak * 0.3 });
}

/* ---------- cue 表 ---------- */

const synth = {
  // 轻 click ~30ms：带通噪声 + 短促高频体
  button(t) {
    noise(t, { dur: 0.03, filter: 'bandpass', freq: 2200, q: 1.1, peak: 0.5 });
    tone(t, { f0: 1600, f1: 1150, dur: 0.02, peak: 0.14, attack: 0.001 });
  },
  // 木块 tock ~70ms：低通噪声 + 190Hz 正弦衰减，温润
  move(t) { tock(t, 190, 1); },
  // 低沉 thud：100Hz 下滑至 62Hz + 极低频噪声
  denied(t) {
    tone(t, { f0: 100, f1: 62, dur: 0.18, peak: 0.6, attack: 0.004 });
    noise(t, { dur: 0.09, filter: 'lowpass', freq: 320, peak: 0.28, attack: 0.003 });
  },
  // 三连快速 tock：音高/力度微变
  shuffle(t) {
    tock(t, 190, 1);
    tock(t + 0.075, 208, 0.9);
    tock(t + 0.15, 176, 0.95);
  },
  // 双音上行 chime ~300ms：E5 → A5
  hint(t) {
    chime(t, 659.25, 0.13, 0.34);
    chime(t + 0.14, 880, 0.16, 0.38);
  },
  // 极轻高频 tick，整体音量自降 0.4
  snap(t) {
    const k = 0.4;
    noise(t, { dur: 0.025, filter: 'highpass', freq: 5000, peak: 0.5 * k });
    tone(t, { f0: 3200, dur: 0.018, peak: 0.22 * k, attack: 0.001 });
  },
  // 木琴 C 大调五声琶音上行 + 收尾和弦，总长 ~1.6s
  win(t) {
    const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5]; // C5 D5 E5 G5 A5 C6
    for (let i = 0; i < scale.length; i++) xylo(t + i * 0.11, scale[i], 0.3 + i * 0.015);
    const chord = [523.25, 659.25, 783.99, 1046.5]; // C E G C6
    for (let i = 0; i < chord.length; i++) xylo(t + 0.72, chord[i], 0.2, 0.85);
  }
};

/* ---------- 播放 / 自定义音效 ---------- */

function playBuffer(buf, t0) {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(master);
  src.start(t0);
  src.stop(t0 + buf.duration + 0.05);
  gcOn(src, [src]);
}

function play(name) {
  if (muted || volume <= 0) return;
  const c = ensureCtx();
  if (!c) return;
  resume();
  try {
    const t0 = c.currentTime + 0.02; // 微前瞻，避开当前时刻竞态
    const buf = buffers[name];
    if (buf) { playBuffer(buf, t0); return; }
    const fn = synth[name];
    if (fn) fn(t0);
  } catch (e) {
    if (window.console && window.console.warn) window.console.warn('[SP.AUDIO] play fail:', name, e);
  }
}

// 兼容 promise / callback 两种 decodeAudioData 形态
function decode(ab) {
  return new Promise((res, rej) => {
    let p;
    try { p = ctx.decodeAudioData(ab, res, rej); } catch (e) { rej(e); return; }
    if (p && p.then) p.then(res, rej);
  });
}

function decodeCue(name) {
  const url = pending[name];
  if (!url || !ctx) return;
  fetch(url)
    .then(r => r.arrayBuffer())
    .then(ab => decode(ab))
    .then(buf => { if (buf) buffers[name] = buf; })
    .catch(() => { delete buffers[name]; }); // 失败回落合成音
}

function applyOverrides(map) {
  if (!map) return;
  for (const key in map) {
    if (NAMES.indexOf(key) < 0) continue; // 未知 cue 忽略
    const url = map[key];
    if (!url) { delete pending[key]; delete buffers[key]; continue; } // 置空 = 恢复默认
    pending[key] = url;
    if (ensureCtx()) decodeCue(key);
  }
}

function setVolume(v) {
  const n = Number(v);
  if (isFinite(n)) volume = Math.min(1, Math.max(0, n));
  applyBus();
}

function setMuted(b) {
  muted = !!b;
  applyBus();
}

return { unlock, play, setVolume, setMuted, applyOverrides, names: NAMES.slice() };
})();
