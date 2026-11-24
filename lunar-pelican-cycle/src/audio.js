// Zero-dependency procedural WebAudio "inside-helmet" sound synthesizer.
// Simulates structure-borne wheel/regolith vibrations through frame & suit,
// dropping cleanly to eerie vacuum silence when airborne!

export class HelmetAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
    this.rollGain = null;
    this.rollFilter = null;
    this.slipGain = null;
    this.slipFilter = null;
    this.lastCrankTick = 0;
  }

  unlock() {
    if (this.muted) return;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.24;
      this.master.connect(this.ctx.destination);

      // Noise buffer for regolith tire texture
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const rollSrc = this.ctx.createBufferSource();
      rollSrc.buffer = buf;
      rollSrc.loop = true;
      this.rollFilter = this.ctx.createBiquadFilter();
      this.rollFilter.type = 'lowpass';
      this.rollFilter.frequency.value = 140;
      this.rollGain = this.ctx.createGain();
      this.rollGain.gain.value = 0;
      rollSrc.connect(this.rollFilter);
      this.rollFilter.connect(this.rollGain);
      this.rollGain.connect(this.master);
      rollSrc.start();

      const slipSrc = this.ctx.createBufferSource();
      slipSrc.buffer = buf;
      slipSrc.loop = true;
      this.slipFilter = this.ctx.createBiquadFilter();
      this.slipFilter.type = 'bandpass';
      this.slipFilter.frequency.value = 420;
      this.slipFilter.Q.value = 1.6;
      this.slipGain = this.ctx.createGain();
      this.slipGain.gain.value = 0;
      slipSrc.connect(this.slipFilter);
      this.slipFilter.connect(this.slipGain);
      this.slipGain.connect(this.master);
      slipSrc.start();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setMuted(flag) {
    this.muted = Boolean(flag);
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.24, this.ctx.currentTime, 0.03);
    }
  }

  isMuted() {
    return this.muted;
  }

  _playTone(freq, dur, type = 'sine', gainPeak = 0.14, endFreq = freq) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + dur);
    }
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(gainPeak, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0005, now + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  playJump() {
    this._playTone(135, 0.16, 'triangle', 0.15, 290);
  }

  playLand(impactSpeed) {
    const strength = Math.min(1, impactSpeed / 5);
    this._playTone(95, 0.18, 'sine', 0.12 + strength * 0.18, 38);
  }

  playBeacon() {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    this._playTone(587.33, 0.18, 'sine', 0.14);
    setTimeout(() => this._playTone(880, 0.28, 'sine', 0.14), 90);
    setTimeout(() => this._playTone(1174.66, 0.36, 'triangle', 0.11), 190);
  }

  playSwitch() {
    this._playTone(520, 0.09, 'triangle', 0.10, 680);
  }

  update(state) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    if (state.grounded) {
      const spd = Math.min(1, state.speed / 12);
      const rollLevel = spd * 0.22;
      this.rollGain.gain.setTargetAtTime(rollLevel, now, 0.04);
      this.rollFilter.frequency.setTargetAtTime(95 + spd * 240, now, 0.05);

      const slipLevel = state.slipRatio > 0.14 ? Math.min(0.28, state.slipRatio * 0.36) : 0;
      this.slipGain.gain.setTargetAtTime(slipLevel, now, 0.04);
    } else {
      // Pure vacuum silence when airborne!
      this.rollGain.gain.setTargetAtTime(0, now, 0.03);
      this.slipGain.gain.setTargetAtTime(0, now, 0.03);
    }

    // Subtle helmet-conduction freewheel tick while cranking
    const crankPhase = Math.floor(state.crankAngle / (Math.PI * 0.5));
    if (crankPhase !== this.lastCrankTick && state.pedalLoad > 0.1) {
      this.lastCrankTick = crankPhase;
      this._playTone(210 + state.pedalLoad * 70, 0.025, 'triangle', 0.025, 140);
    }
  }
}
