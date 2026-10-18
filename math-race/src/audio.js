'use strict';

/* WebAudio 极简合成音效，零音频资源 */

const AudioFX = (() => {
  let ctx = null;
  function beep(freq, dur, type, gain, delay) {
    if (!prefs.sound) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      const t0 = ctx.currentTime + (delay || 0);
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type || 'square';
      o.frequency.value = freq;
      g.gain.setValueAtTime(gain || 0.11, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    } catch {}
  }
  return {
    correct() { beep(880, 0.09); beep(1318, 0.14, 'square', 0.11, 0.09); },
    wrong() { beep(220, 0.2, 'sawtooth', 0.09); },
    tick() { beep(660, 0.06, 'square', 0.09); },
    go() { beep(880, 0.1); beep(1174, 0.28, 'square', 0.11, 0.1); },
    finish() { [523, 659, 784, 1046].forEach((f, i) => beep(f, 0.16, 'square', 0.11, i * 0.13)); },
  };
})();
