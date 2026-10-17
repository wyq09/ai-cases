const BPM = 128;

export class RaceAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.started = false;
    this.musicStarted = false;
    this.musicTimer = null;
    this.nextNote = 0;
    this.step = 0;
    this.speedNorm = 0;
    this.engineOn = false;
    this.driftAmt = 0;
    this.nitroAmt = 0;
    this.offroadAmt = 0;
    this.duckAmt = 1;
  }

  get available() {
    return !!this.ctx;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.enabled ? 0.9 : 0;
      this.comp = ctx.createDynamicsCompressor();
      this.comp.threshold.value = -16;
      this.comp.knee.value = 22;
      this.comp.ratio.value = 5;
      this.comp.attack.value = 0.004;
      this.comp.release.value = 0.22;
      this.master.connect(this.comp);
      this.comp.connect(ctx.destination);

      this.sfx = ctx.createGain();
      this.sfx.gain.value = 0.9;
      this.sfx.connect(this.master);

      this.music = ctx.createGain();
      this.music.gain.value = 0.15;
      this.music.connect(this.master);

      this.delay = ctx.createDelay(0.6);
      this.delay.delayTime.value = 0.285;
      const fb = ctx.createGain();
      fb.gain.value = 0.24;
      const wet = ctx.createGain();
      wet.gain.value = 0.32;
      this.music.connect(this.delay);
      this.delay.connect(fb);
      fb.connect(this.delay);
      this.delay.connect(wet);
      wet.connect(this.music);

      this.noiseBuf = this.makeNoise(2.2);
      this.buildEngine();
      this.buildLoops();
      this.started = true;
      return true;
    } catch (err) {
      console.warn('audio init failed', err);
      this.ctx = null;
      return false;
    }
  }

  makeNoise(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.42 + white * 0.58;
      data[i] = last;
    }
    return buf;
  }

  buildEngine() {
    const ctx = this.ctx;
    this.engine = ctx.createGain();
    this.engine.gain.value = 0;
    this.engine.connect(this.sfx);

    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 420;
    this.engFilter.Q.value = 2.5;
    this.engFilter.connect(this.engine);

    this.oscA = ctx.createOscillator();
    this.oscA.type = 'sawtooth';
    this.oscA.frequency.value = 58;
    this.oscA.connect(this.engFilter);

    this.oscB = ctx.createOscillator();
    this.oscB.type = 'square';
    this.oscB.frequency.value = 29;
    this.oscB.detune.value = 9;
    const bGain = ctx.createGain();
    bGain.gain.value = 0.5;
    this.oscB.connect(bGain);
    bGain.connect(this.engFilter);

    this.oscC = ctx.createOscillator();
    this.oscC.type = 'sawtooth';
    this.oscC.frequency.value = 116;
    this.oscC.detune.value = -11;
    const cGain = ctx.createGain();
    cGain.gain.value = 0.25;
    this.oscC.connect(cGain);
    cGain.connect(this.engFilter);

    this.oscA.start();
    this.oscB.start();
    this.oscC.start();

    // exhaust rasp
    const exhaust = ctx.createBufferSource();
    exhaust.buffer = this.noiseBuf;
    exhaust.loop = true;
    const exFilter = ctx.createBiquadFilter();
    exFilter.type = 'bandpass';
    exFilter.frequency.value = 260;
    exFilter.Q.value = 0.9;
    this.exhaustGain = ctx.createGain();
    this.exhaustGain.gain.value = 0;
    exhaust.connect(exFilter);
    exFilter.connect(this.exhaustGain);
    this.exhaustGain.connect(this.sfx);
    exhaust.start();
    this.exhaust = exhaust;
  }

  buildLoops() {
    const ctx = this.ctx;
    const loopNoise = (filterType, freq, q, gainVal) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = filterType;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gainVal;
      src.connect(f);
      f.connect(g);
      g.connect(this.sfx);
      src.start();
      return { src, f, g };
    };
    this.drift = loopNoise('bandpass', 1750, 4.5, 0);
    this.wind = loopNoise('highpass', 900, 0.7, 0);
    this.offroad = loopNoise('lowpass', 180, 0.8, 0);
    this.nitroLoop = loopNoise('bandpass', 900, 1.8, 0);
  }

  setEnabled(v) {
    this.enabled = !!v;
    if (this.master) {
      this.master.gain.setTargetAtTime(v ? 0.9 : 0, this.ctx.currentTime, 0.03);
    }
  }

  setEngineActive(on) {
    this.engineOn = !!on;
    if (!this.ctx) return;
    this.engine.gain.setTargetAtTime(on ? 0.052 : 0.0, this.ctx.currentTime, 0.12);
  }

  update(dt, info) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const speed = Math.max(0, Math.min(1, info.speed || 0));
    this.speedNorm += (speed - this.speedNorm) * Math.min(1, dt * 6);
    const s = this.speedNorm;
    if (this.engineOn) {
      const base = 52 + s * 152 + (info.boost ? 26 : 0);
      this.oscA.frequency.setTargetAtTime(base, t, 0.06);
      this.oscB.frequency.setTargetAtTime(base * 0.5, t, 0.06);
      this.oscC.frequency.setTargetAtTime(base * 2.02, t, 0.06);
      this.engFilter.frequency.setTargetAtTime(340 + s * 1500 + (info.boost ? 700 : 0), t, 0.08);
      this.engine.gain.setTargetAtTime(0.045 + s * 0.022, t, 0.1);
      this.exhaustGain.gain.setTargetAtTime(0.016 + s * 0.028, t, 0.1);
    }
    const driftTarget = info.drifting ? 0.052 + Math.min(0.03, Math.abs(info.steer || 0) * 0.02) : 0;
    this.driftAmt += (driftTarget - this.driftAmt) * Math.min(1, dt * 9);
    this.drift.g.gain.setTargetAtTime(this.driftAmt, t, 0.05);
    this.drift.f.frequency.setTargetAtTime(1450 + s * 1200 + Math.sin(t * 14) * 160, t, 0.08);

    this.wind.g.gain.setTargetAtTime(s * s * 0.055 + (info.boost ? 0.025 : 0), t, 0.15);
    this.wind.f.frequency.setTargetAtTime(800 + s * 2200, t, 0.2);

    this.offroadAmt += ((info.offroad ? 0.075 : 0) - this.offroadAmt) * Math.min(1, dt * 8);
    this.offroad.g.gain.setTargetAtTime(this.offroadAmt, t, 0.06);

    this.nitroAmt += ((info.nitro ? 0.045 : 0) - this.nitroAmt) * Math.min(1, dt * 12);
    this.nitroLoop.g.gain.setTargetAtTime(this.nitroAmt, t, 0.05);
    this.nitroLoop.f.frequency.setTargetAtTime(700 + s * 1600 + Math.sin(t * 9) * 240, t, 0.1);
  }

  tone(freq, dur, type = 'sine', vol = 0.2, when = 0, sweepTo = null, filterFreq = null) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.02, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = osc;
    if (filterFreq) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filterFreq;
      osc.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(this.sfx);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  noiseBurst(dur = 0.3, vol = 0.2, type = 'highpass', freq = 1200, when = 0, sweepTo = null, q = 0.9) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfx);
    src.start(t0);
    src.stop(t0 + dur + 0.03);
  }

  ui() {
    this.tone(720, 0.07, 'triangle', 0.1);
    this.tone(1050, 0.09, 'sine', 0.06, 0.03);
  }

  countdown(n) {
    if (n > 0) {
      this.tone(520, 0.16, 'square', 0.14, 0, null, 1800);
      this.tone(260, 0.2, 'sine', 0.12);
    } else {
      this.tone(880, 0.5, 'square', 0.16, 0, null, 3200);
      this.tone(1320, 0.4, 'sawtooth', 0.08, 0.02, null, 4200);
      this.noiseBurst(0.35, 0.16, 'bandpass', 1600, 0, 4400, 1.2);
    }
  }

  startBoost() {
    this.noiseBurst(0.55, 0.2, 'bandpass', 400, 0, 4200, 1.1);
    this.tone(420, 0.42, 'sawtooth', 0.12, 0, 900, 2600);
    this.tone(840, 0.5, 'triangle', 0.09, 0.05, 1680);
  }

  boost(level = 1) {
    const lv = Math.max(1, Math.min(3, level));
    this.noiseBurst(0.26 + lv * 0.08, 0.12 + lv * 0.03, 'bandpass', 700, 0, 2600 + lv * 900, 1.4);
    this.tone(420 + lv * 100, 0.22 + lv * 0.08, 'square', 0.07, 0, 900 + lv * 200, 3000);
    if (lv >= 3) this.tone(1320, 0.3, 'triangle', 0.07, 0.04, 1760);
  }

  doubleBoost() {
    this.noiseBurst(0.3, 0.16, 'bandpass', 900, 0, 3800, 1.8);
    this.tone(760, 0.12, 'square', 0.1, 0, 1200, 3600);
    this.tone(1140, 0.18, 'square', 0.09, 0.09, 1800, 4000);
    this.tone(1520, 0.24, 'triangle', 0.06, 0.16, 2280);
  }

  nitro() {
    this.noiseBurst(1.0, 0.24, 'bandpass', 500, 0, 5200, 1.1);
    this.tone(120, 0.8, 'sawtooth', 0.14, 0, 46, 900);
    this.tone(660, 0.9, 'triangle', 0.06, 0.02, 1320);
    this.noiseBurst(0.5, 0.1, 'highpass', 2400, 0.15, 6000, 0.7);
  }

  pad() {
    this.tone(880, 0.12, 'triangle', 0.1);
    this.tone(1174.7, 0.12, 'triangle', 0.09, 0.05);
    this.tone(1568, 0.22, 'sine', 0.08, 0.1);
    this.noiseBurst(0.16, 0.06, 'highpass', 3000);
  }

  collision() {
    this.noiseBurst(0.16, 0.18, 'lowpass', 900, 0, 180, 1.2);
    this.tone(110, 0.16, 'square', 0.13, 0, 55, 700);
    this.tone(320, 0.12, 'sawtooth', 0.06, 0.01, 180, 1400);
  }

  driftTick(level) {
    const base = [0, 740, 980, 1320][level] || 740;
    this.tone(base, 0.09, 'triangle', 0.09, 0, base * 1.5);
    this.tone(base * 1.5, 0.12, 'sine', 0.06, 0.045, base * 2.1);
    if (level >= 3) {
      this.tone(base * 2, 0.2, 'square', 0.05, 0.1, base * 2.6, 5200);
      this.noiseBurst(0.14, 0.06, 'highpass', 4200, 0.02, 7200);
    }
  }

  hitstop() {
    this.noiseBurst(0.09, 0.2, 'lowpass', 520, 0, 120, 1.4);
    this.tone(72, 0.15, 'sine', 0.2, 0, 38);
  }

  lap() {
    this.tone(880, 0.12, 'triangle', 0.1);
    this.tone(1174.7, 0.22, 'triangle', 0.09, 0.1);
  }

  itemPickup() {
    this.tone(1046.5, 0.08, 'triangle', 0.08);
    this.tone(1568, 0.12, 'triangle', 0.07, 0.05);
    this.tone(2093, 0.16, 'sine', 0.05, 0.1);
  }

  itemUse(id) {
    const base = id === 'shield' ? 660 : id === 'shock' ? 300 : id === 'missile' ? 520 : 760;
    this.tone(base, 0.1, 'square', 0.08, 0, base * 1.5, 3200);
    this.tone(base * 1.33, 0.14, 'triangle', 0.06, 0.05, base * 2);
  }

  missile() {
    this.noiseBurst(0.4, 0.14, 'bandpass', 1200, 0, 3200, 1.8);
    this.tone(300, 0.32, 'sawtooth', 0.08, 0, 860, 2400);
    this.tone(900, 0.22, 'square', 0.05, 0.08, 1500);
  }

  mineDrop() {
    this.tone(220, 0.12, 'square', 0.08, 0, 120, 900);
    this.noiseBurst(0.14, 0.08, 'lowpass', 700, 0, 220, 1.2);
  }

  explosion() {
    this.noiseBurst(0.42, 0.22, 'lowpass', 1400, 0, 140, 1.1);
    this.tone(110, 0.34, 'square', 0.14, 0, 42, 700);
    this.tone(62, 0.4, 'sine', 0.12, 0);
  }

  shield() {
    this.tone(523.25, 0.2, 'triangle', 0.08);
    this.tone(783.99, 0.24, 'triangle', 0.07, 0.07);
    this.tone(1046.5, 0.36, 'sine', 0.06, 0.14, 1318.5);
    this.noiseBurst(0.24, 0.05, 'highpass', 3200, 0, 6200, 0.8);
  }

  shieldBreak() {
    this.noiseBurst(0.22, 0.12, 'highpass', 2600, 0, 1400, 1.1);
    this.tone(1320, 0.16, 'triangle', 0.07, 0, 660);
    this.tone(880, 0.2, 'sine', 0.06, 0.05, 440);
  }

  shock() {
    this.noiseBurst(0.5, 0.16, 'bandpass', 2400, 0, 600, 2.4);
    this.tone(180, 0.5, 'sawtooth', 0.1, 0, 60, 1800);
    this.tone(1400, 0.22, 'square', 0.05, 0.1, 300);
  }

  stun() {
    this.noiseBurst(0.3, 0.16, 'lowpass', 1000, 0, 200, 1.4);
    this.tone(140, 0.4, 'sawtooth', 0.12, 0, 60, 900);
    this.tone(520, 0.3, 'triangle', 0.05, 0.05, 260);
  }

  stageClear() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this.tone(f, 0.22, 'square', 0.09, i * 0.09, null, 3600);
      this.tone(f * 0.5, 0.3, 'triangle', 0.06, i * 0.09);
    });
    this.noiseBurst(0.4, 0.08, 'highpass', 3000, 0.15, 6500);
  }

  stageStart() {
    this.tone(392, 0.16, 'sawtooth', 0.07, 0, 784, 2600);
    this.tone(587.33, 0.2, 'triangle', 0.07, 0.08, 1174.7);
    this.noiseBurst(0.28, 0.08, 'bandpass', 900, 0, 2600, 1.4);
  }

  finish() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((f, i) => {
      this.tone(f, 0.32, 'square', 0.1, i * 0.11, null, 3600);
      this.tone(f * 0.5, 0.4, 'triangle', 0.07, i * 0.11);
    });
    this.noiseBurst(0.6, 0.1, 'highpass', 3000, 0.2, 7000);
  }

  startMusic() {
    if (!this.ctx || this.musicStarted) return;
    this.musicStarted = true;
    this.nextNote = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.musicTimer = setInterval(() => this.scheduleMusic(), 80);
  }

  stopMusic() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
    this.musicStarted = false;
  }

  scheduleMusic() {
    if (!this.ctx) return;
    const ahead = this.ctx.currentTime + 0.32;
    const stepDur = 60 / BPM / 4;
    let guard = 0;
    while (this.nextNote < ahead && guard++ < 32) {
      this.scheduleStep(this.step, this.nextNote, stepDur);
      this.nextNote += stepDur;
      this.step = (this.step + 1) % 64;
    }
  }

  scheduleStep(step, time, stepDur) {
    const ctx = this.ctx;
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const chords = [
      [110.0, [220.0, 261.63, 329.63, 440.0]],
      [87.31, [174.61, 220.0, 261.63, 349.23]],
      [130.81, [261.63, 329.63, 392.0, 523.25]],
      [98.0, [196.0, 246.94, 293.66, 392.0]],
    ];
    const [root, tones] = chords[bar];
    const rel = (f, dur, type, vol, dest, when = 0) => {
      const t0 = time + when;
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(f, t0);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(dest);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    };

    if (s === 0 || s === 4 || s === 8 || s === 12) {
      const t0 = time;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, t0);
      osc.frequency.exponentialRampToValueAtTime(44, t0 + 0.13);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.42, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
      osc.connect(g);
      g.connect(this.music);
      osc.start(t0);
      osc.stop(t0 + 0.18);
    }
    if (s === 4 || s === 12) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 1600;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.16, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
      src.connect(f); f.connect(g); g.connect(this.music);
      src.start(time); src.stop(time + 0.18);
    }
    if (s % 2 === 0) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 7000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(s % 4 === 0 ? 0.05 : 0.028, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
      src.connect(f); f.connect(g); g.connect(this.music);
      src.start(time); src.stop(time + 0.06);
    }
    if (s === 0 || s === 3 || s === 6 || s === 8 || s === 11 || s === 14) {
      const fret = [0, 0, 12, 0, 7, 12][s % 6] || 0;
      rel(root * 2 * Math.pow(2, fret / 12), 0.17, 'sawtooth', 0.12, this.music);
    }
    const arp = [0, 1, 2, 3, 2, 1, 2, 3, 0, 2, 1, 3, 2, 3, 1, 2][s];
    rel(tones[arp] * 2, 0.085, 'triangle', 0.035, this.music);
    if (s === 0) {
      for (const f of tones) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = f * 0.5;
        osc.detune.value = (Math.random() - 0.5) * 8;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, time);
        g.gain.linearRampToValueAtTime(0.02, time + 0.12);
        g.gain.linearRampToValueAtTime(0.0001, time + stepDur * 16);
        const fnode = ctx.createBiquadFilter();
        fnode.type = 'lowpass';
        fnode.frequency.value = 900;
        osc.connect(fnode); fnode.connect(g); g.connect(this.music);
        osc.start(time); osc.stop(time + stepDur * 16 + 0.05);
      }
    }
  }

  duck(amount = 0.35, hold = 1.2) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.music.gain.cancelScheduledValues(t);
    this.music.gain.setTargetAtTime(0.15 * amount, t, 0.08);
    this.music.gain.setTargetAtTime(0.15, t + hold, 0.4);
  }
}
