(() => {
  const SC = (window.__SC = window.__SC || {});

  // ---------------------------------------------------------------------------
  // Math & deterministic PRNG helpers (self-contained for zero boot fragility)
  // ---------------------------------------------------------------------------
  const TAU = Math.PI * 2;
  const D1 = 32.703; // C1 fundamental (Hz) — low, cold anchor; everything stacks on C
  const H = (n) => D1 * n;

  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const ss = (t) => {
    const x = clamp(t, 0, 1);
    return x * x * (3 - 2 * x);
  };
  const expDec = (t, k) => Math.exp(-t * k);

  function mulberry32(seed) {
    let s = (seed * 2654435761) >>> 0 || 1;
    return () => {
      s ^= s << 13;
      s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5;
      s >>>= 0;
      return s / 4294967296;
    };
  }

  // Just-intonation D-harmonic lattice for musical chimes & accents
  const JI_RATIOS = [1, 9 / 8, 5 / 4, 11 / 8, 3 / 2, 27 / 16, 15 / 8];
  function snapHarmonic(rate) {
    let best = 1;
    let err = 9;
    for (let oct = -2; oct <= 2; oct++) {
      const mul = Math.pow(2, oct);
      for (let i = 0; i < JI_RATIOS.length; i++) {
        const cand = JI_RATIOS[i] * mul;
        const d = Math.abs(Math.log2(rate / cand));
        if (d < err) {
          err = d;
          best = cand;
        }
      }
    }
    return best;
  }

  // ---------------------------------------------------------------------------
  // Hand-written Cytomic/TPT State Variable Filter (SVF)
  // ---------------------------------------------------------------------------
  class SVF {
    constructor(freq = 1000, q = 0.707, sr = 48000) {
      this.ic1eq = 0;
      this.ic2eq = 0;
      this.lp = 0;
      this.bp = 0;
      this.hp = 0;
      this.sr = sr;
      this.k = 1 / q;
      this.a1 = 0;
      this.a2 = 0;
      this.a3 = 0;
      if (freq > 0) this.set(freq, q);
    }
    set(freq, q = 0.707) {
      const f = clamp(freq, 10, this.sr * 0.45);
      const g = Math.tan((Math.PI * f) / this.sr);
      this.k = 1 / Math.max(0.15, q);
      this.a1 = 1 / (1 + g * (g + this.k));
      this.a2 = g * this.a1;
      this.a3 = g * this.a2;
    }
    run(v0) {
      const v3 = v0 - this.ic2eq;
      const v1 = this.a1 * this.ic1eq + this.a2 * v3;
      const v2 = this.ic2eq + this.a2 * this.ic1eq + this.a3 * v3;
      this.ic1eq = 2 * v1 - this.ic1eq;
      this.ic2eq = 2 * v2 - this.ic2eq;
      this.lp = v2;
      this.bp = v1 * this.k;
      this.hp = v0 - this.k * v1 - v2;
      return v2;
    }
  }

  // ---------------------------------------------------------------------------
  // Offline DSP Synthesis Primitives
  // ---------------------------------------------------------------------------
  const SR_SFX = 48000;
  const SR_PAD = 32000;

  function allocChannels(durSec, ch = 1, sr = SR_SFX) {
    const len = Math.max(16, Math.ceil(durSec * sr));
    return Array.from({ length: ch }, () => new Float32Array(len));
  }

  // Damped modal resonator (coupled-form sine rotation — fast & click-free)
  function modal(buf, freq, amp, decay, { at = 0, ph = 0, atk = 0, sr = SR_SFX } = {}) {
    if (freq > sr * 0.43 || freq < 8 || decay <= 0) return;
    let idx = Math.floor(at * sr);
    const len = buf.length;
    const damp = Math.exp(-6.907755 / (decay * sr));
    const w = (TAU * freq) / sr;
    const cs = Math.cos(w) * damp;
    const sn = Math.sin(w) * damp;
    let s = amp * Math.sin(ph);
    let c = amp * Math.cos(ph);
    const atkN = Math.max(1, Math.floor(atk * sr));
    const end = Math.min(len, idx + Math.ceil(decay * sr * 1.45));
    let m = 0;
    for (; idx < end; idx++, m++) {
      if (idx >= 0) {
        const env = m < atkN ? 0.5 - 0.5 * Math.cos((Math.PI * m) / atkN) : 1;
        buf[idx] += s * env;
      }
      const ns = s * cs + c * sn;
      c = c * cs - s * sn;
      s = ns;
    }
  }

  // Pitch-swept harmonic oscillator
  function sweep(buf, at, dur, freqFn, ampFn, { sr = SR_SFX, ph = 0 } = {}) {
    const start = Math.floor(at * sr);
    const count = Math.floor(dur * sr);
    const len = buf.length;
    let phase = ph;
    for (let i = 0; i < count && start + i < len; i++) {
      const u = i / Math.max(1, count);
      if (start + i >= 0) {
        buf[start + i] += Math.sin(phase) * ampFn(u);
      }
      phase += (TAU * freqFn(u)) / sr;
    }
  }

  // SVF-filtered noise burst
  function noiseBurst(buf, rng, at, dur, mode, freqFn, q, ampFn, { sr = SR_SFX } = {}) {
    const svf = new SVF(1000, q, sr);
    const start = Math.floor(at * sr);
    const count = Math.floor(dur * sr);
    const len = buf.length;
    for (let i = 0; i < count && start + i < len; i++) {
      const u = i / Math.max(1, count);
      if ((i & 15) === 0) svf.set(freqFn(u), q);
      svf.run(rng() * 2 - 1);
      if (start + i >= 0) {
        buf[start + i] += svf[mode] * ampFn(u);
      }
    }
  }

  // Micro-grain fibrous bursts (paper tears, creases, rock dust)
  function fibres(buf, rng, at, dur, rate, envFn, amp = 1, fLo = 1400, fHi = 5400, sr = SR_SFX) {
    const count = Math.max(4, Math.floor(dur * rate));
    for (let i = 0; i < count; i++) {
      const u = i / count;
      const t = at + (u + (rng() - 0.5) / count) * dur;
      if (t < 0) continue;
      const e = envFn(clamp(u, 0, 1)) * (0.4 + 0.6 * rng()) * amp;
      const f = lerp(fLo, fHi, rng());
      modal(buf, f, e * 0.28, 0.004 + 0.012 * rng(), { at: t, atk: 0.0005, ph: rng() * TAU, sr });
    }
  }

  // DC blocker + anti-click tail fade + peak normalization
  function finalize(channels, peak = 1, { fade = 0.005, sr = SR_SFX, dc = true } = {}) {
    let maxAbs = 0;
    const rDc = 1 - (TAU * 18) / sr;
    const fadeN = Math.floor(fade * sr);
    for (let c = 0; c < channels.length; c++) {
      const buf = channels[c];
      const n = buf.length;
      if (dc) {
        let x1 = 0;
        let y1 = 0;
        for (let i = 0; i < n; i++) {
          const x = buf[i];
          const y = x - x1 + rDc * y1;
          x1 = x;
          y1 = y;
          buf[i] = y;
        }
      }
      for (let i = 0; i < fadeN && i < n; i++) {
        buf[n - 1 - i] *= i / Math.max(1, fadeN);
      }
      for (let i = 0; i < n; i++) {
        const a = Math.abs(buf[i]);
        if (a > maxAbs) maxAbs = a;
      }
    }
    const scale = maxAbs > 1e-7 ? peak / maxAbs : 0;
    for (let c = 0; c < channels.length; c++) {
      const buf = channels[c];
      for (let i = 0; i < buf.length; i++) buf[i] *= scale;
    }
    return { ch: channels, sr };
  }

  // ---------------------------------------------------------------------------
  // Seamless Looping Pad & Noise Buffer Generators (exact periodic wrap)
  // ---------------------------------------------------------------------------
  function* genPeriodicPad({
    f,
    partials,
    dur = 4.0,
    seed = 1,
    sr = SR_PAD,
    rms = 0.14,
    spread = 0.4,
    detune = 0.0035,
  }) {
    const N = Math.round(dur * sr);
    const L = new Float32Array(N);
    const R = new Float32Array(N);
    const rng = mulberry32(seed);
    const baseCyc = Math.max(1, Math.round(f * dur));
    const exactF = baseCyc / dur;

    for (let p = 0; p < partials.length; p++) {
      const [ratio, amp, voices = 3] = partials[p];
      if (exactF * ratio > sr * 0.44) continue;
      for (let v = 0; v < voices; v++) {
        // Integer cycle count ensures 100% click-free seamless looping
        const jitter = voices > 1 ? (v / (voices - 1) - 0.5) * 2 * detune : 0;
        const cyc = Math.max(1, Math.round(baseCyc * ratio * (1 + jitter)));
        const w = (TAU * cyc) / N;
        const phL = rng() * TAU;
        const phR = phL + (rng() - 0.5) * TAU * spread;
        const gain = amp / Math.sqrt(voices);
        const pan = 0.5 + (rng() - 0.5) * spread;
        const gL = gain * Math.sqrt(1 - pan);
        const gR = gain * Math.sqrt(pan);
        for (let i = 0; i < N; i++) {
          const ang = w * i;
          L[i] += Math.sin(ang + phL) * gL;
          R[i] += Math.sin(ang + phR) * gR;
        }
        if ((v & 1) === 1) yield;
      }
      yield;
    }

    for (const buf of [L, R]) {
      let sum = 0;
      for (let i = 0; i < N; i++) sum += buf[i] * buf[i];
      const norm = rms / Math.sqrt(sum / N || 1);
      for (let i = 0; i < N; i++) buf[i] *= norm;
    }
    return { ch: [L, R], sr, f: exactF };
  }

  function* genNoiseLoop(kind, dur = 4.0, seed = 101, sr = SR_PAD) {
    const N = Math.round(dur * sr);
    const L = new Float32Array(N);
    const R = new Float32Array(N);
    const rng = mulberry32(seed);

    for (let c = 0; c < 2; c++) {
      const out = c === 0 ? L : R;
      // Paul Kellet pink filter state + brown integrator + SVF for hiss/rip
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      let brown = 0;
      const svf = new SVF(kind === 'rip' ? 2200 : 3800, kind === 'rip' ? 1.1 : 0.6, sr);
      // Warm-up 1024 samples before recording so loop edges stay smooth
      const warm = 1024;
      const total = N + warm;
      const tmp = new Float32Array(N);
      for (let i = 0; i < total; i++) {
        const w = rng() * 2 - 1;
        let sample = 0;
        if (kind === 'pink') {
          b0 = 0.99886 * b0 + w * 0.0555179;
          b1 = 0.99332 * b1 + w * 0.0750759;
          b2 = 0.96900 * b2 + w * 0.1538520;
          b3 = 0.86650 * b3 + w * 0.3104856;
          b4 = 0.55000 * b4 + w * 0.5329522;
          b5 = -0.7616 * b5 - w * 0.0168980;
          sample = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.06;
          b6 = w * 0.115926;
        } else if (kind === 'brown') {
          brown = (brown + 0.028 * w) * 0.992;
          sample = brown * 1.4;
        } else if (kind === 'hiss') {
          svf.run(w);
          sample = svf.hp * 0.25;
        } else {
          // fibrous rip texture: sparse micro-crackles + high-mid grit
          const spike = rng() < 0.035 ? (rng() * 2 - 1) * 3.4 : w * 0.35;
          svf.run(spike);
          sample = (svf.bp * 0.8 + svf.hp * 0.25) * 0.32;
        }
        if (i >= warm) tmp[i - warm] = sample;
        if ((i & 16383) === 0) yield;
      }
      // Crossfade tail into head over 0.25s for 100% seamless wrap
      const xf = Math.min(Math.floor(sr * 0.25), N >> 2);
      for (let i = 0; i < N; i++) {
        if (i < xf) {
          const a = i / xf;
          out[i] = tmp[i] * Math.sqrt(a) + tmp[N - xf + i] * Math.sqrt(1 - a);
        } else {
          out[i] = tmp[i];
        }
      }
      yield;
    }

    // RMS normalize
    for (const buf of [L, R]) {
      let s = 0;
      for (let i = 0; i < N; i++) s += buf[i] * buf[i];
      const norm = 0.12 / Math.sqrt(s / N || 1);
      for (let i = 0; i < N; i++) buf[i] *= norm;
    }
    return { ch: [L, R], sr, f: 1 };
  }

  // Procedural stereo hall / room convolution IR
  function* genIR({ dur = 2.6, decay = 2.2, bright = 4600, preDelay = 0.018, seed = 77, sr = SR_PAD }) {
    const N = Math.round(dur * sr);
    const L = new Float32Array(N);
    const R = new Float32Array(N);
    const rng = mulberry32(seed);
    const preN = Math.floor(preDelay * sr);

    for (let c = 0; c < 2; c++) {
      const out = c === 0 ? L : R;
      const lp = new SVF(bright, 0.55, sr);
      const hp = new SVF(95, 0.55, sr);
      // Sparse early reflections
      for (let r = 0; r < 14; r++) {
        const idx = Math.min(N - 1, preN + Math.floor((0.005 + r * 0.009 + rng() * 0.008) * sr));
        out[idx] += (rng() * 2 - 1) * (0.45 / (1 + r * 0.35));
      }
      for (let i = preN; i < N; i++) {
        const t = (i - preN) / sr;
        const env = Math.exp(-t * (6.2 / decay)) * Math.min(1, t / 0.015);
        const dFreq = lerp(bright, 620, clamp(t / dur, 0, 1));
        if ((i & 63) === 0) lp.set(dFreq, 0.55);
        const w = (rng() * 2 - 1) * env;
        lp.run(w);
        hp.run(lp.lp);
        out[i] += hp.hp * 0.32;
        if ((i & 16383) === 0) yield;
      }
      yield;
    }
    return finalize([L, R], 0.55, { fade: 0.12, sr, dc: true });
  }

  // ---------------------------------------------------------------------------
  // SFX Specifications: [variations, defaultGain, meta, synthFn(rng, varIdx)]
  // ---------------------------------------------------------------------------
  const SFX_SPECS = {
    type: [
      6,
      0.13,
      { room: 0.18, jit: 0.045, prio: 0, gap: 0.014 },
      (rng, v) => {
        const [b] = allocChannels(0.085);
        const tune = 0.92 + v * 0.032 + (rng() - 0.5) * 0.05;
        modal(b, 2650 * tune, 0.45, 0.014, { atk: 0.0004 });
        modal(b, 1480 * tune, 0.52, 0.022, { atk: 0.0005 });
        modal(b, 520 * tune, 0.48, 0.028, { atk: 0.0008 });
        noiseBurst(b, rng, 0, 0.006, 'bp', () => 3400 * tune, 0.9, (u) => 0.72 * (1 - u));
        noiseBurst(b, rng, 0.016, 0.004, 'bp', () => 2100 * tune, 1.0, (u) => 0.18 * (1 - u));
        return finalize([b], 1, { fade: 0.006 });
      },
    ],
    click: [
      3,
      0.13,
      { room: 0.12, jit: 0.025, prio: 0, gap: 0.016 },
      (rng) => {
        const [b] = allocChannels(0.095);
        modal(b, 1320 + rng() * 90, 0.52, 0.026, { atk: 0.0007 });
        modal(b, 580 + rng() * 40, 0.48, 0.032, { atk: 0.001 });
        noiseBurst(b, rng, 0, 0.005, 'lp', () => 4400, 0.7, (u) => 0.46 * (1 - u));
        noiseBurst(b, rng, 0.048, 0.004, 'bp', () => 2600, 1.0, (u) => 0.2 * (1 - u));
        modal(b, 1560, 0.14, 0.018, { at: 0.048 });
        return finalize([b], 1, { fade: 0.006 });
      },
    ],
    tick: [
      4,
      0.11,
      { room: 0.22, hall: 0.05, jit: 0.02, prio: 1, gap: 0.012 },
      (rng) => {
        const [b] = allocChannels(0.085);
        const k = 1 + (rng() - 0.5) * 0.04;
        modal(b, 2480 * k, 0.5, 0.019, { atk: 0.0004 });
        modal(b, 4120 * k, 0.28, 0.012, { atk: 0.0003 });
        modal(b, 1080 * k, 0.34, 0.026, { atk: 0.0006 });
        noiseBurst(b, rng, 0, 0.003, 'hp', () => 4800, 0.7, (u) => 0.55 * (1 - u));
        return finalize([b], 1, { fade: 0.005 });
      },
    ],
    select: [
      1,
      0.12,
      { room: 0.1, hall: 0.25, jit: 0, prio: 0 },
      () => {
        const [L, R] = allocChannels(0.64, 2);
        const tone = (at, freq, amp, pan) => {
          for (const [ch, g, det] of [
            [L, 1 - pan, 1],
            [R, pan, 1.0015],
          ]) {
            modal(ch, freq * det, amp * g, 0.42, { at, atk: 0.004 });
            modal(ch, freq * 2 * det, amp * 0.18 * g, 0.2, { at, atk: 0.003 });
            modal(ch, freq * 2.756, amp * 0.09 * g, 0.09, { at, atk: 0.002 });
            modal(ch, freq * 0.5, amp * 0.16 * g, 0.3, { at, atk: 0.01 });
          }
        };
        tone(0, H(24), 0.75, 0.38);
        tone(0.068, H(33), 1.0, 0.62);
        return finalize([L, R], 1, { fade: 0.03 });
      },
    ],
    delete: [
      2,
      0.16,
      { room: 0.08, jit: 0.025, prio: 0 },
      (rng) => {
        const [b] = allocChannels(0.14);
        sweep(
          b,
          0,
          0.09,
          (u) => lerp(175, 58, Math.sqrt(u)),
          (u) => 0.9 * Math.min(1, u * 40) * (u < 0.8 ? expDec(u, 1.7) : expDec(u, 1.7) * (1 - u) * 5)
        );
        noiseBurst(b, rng, 0, 0.032, 'lp', (u) => lerp(2500, 480, u), 0.7, (u) => 0.48 * expDec(u, 4));
        noiseBurst(b, rng, 0.072, 0.01, 'bp', () => 860, 1.0, (u) => 0.28 * (1 - u));
        return finalize([b], 1, { fade: 0.012 });
      },
    ],
    whoosh: [
      3,
      0.17,
      { room: 0.1, hall: 0.16, jit: 0.05, prio: 2 },
      (rng) => {
        const [L, R] = allocChannels(0.96, 2);
        const peak = 0.44 + rng() * 0.12;
        const env = (u) => {
          const s = u < peak ? ss(u / peak) : ss((1 - u) / (1 - peak));
          return s * s;
        };
        const freq = (u) => {
          const s = u < peak ? ss(u / peak) : ss((1 - u) / (1 - peak));
          return 240 + 1550 * Math.pow(s, 1.55) * (u < peak ? 1 : 0.82) + 180 * u;
        };
        noiseBurst(L, rng, 0, 0.92, 'bp', freq, 0.85, (u) => env(u) * (1.25 - u * 0.88));
        noiseBurst(R, rng, 0.016, 0.92, 'bp', (u) => freq(u) * 1.05, 0.85, (u) => env(u) * (0.42 + u * 0.92));
        for (const ch of [L, R]) {
          noiseBurst(ch, rng, 0, 0.92, 'lp', (u) => 150 + 170 * env(u), 0.7, (u) => env(u) * 0.65);
        }
        return finalize([L, R], 1, { fade: 0.04 });
      },
    ],
    thud: [
      3,
      0.26,
      { room: 0.25, hall: 0.08, jit: 0.04, prio: 2 },
      (rng) => {
        const [b] = allocChannels(0.62);
        sweep(
          b,
          0,
          0.52,
          (u) => 42 + 44 * expDec(u, 14),
          (u) => expDec(u, 5.8) * Math.min(1, u * 90)
        );
        modal(b, 114 + rng() * 14, 0.42, 0.16, { atk: 0.003 });
        modal(b, 198 + rng() * 22, 0.22, 0.09, { atk: 0.002 });
        noiseBurst(b, rng, 0, 0.075, 'lp', (u) => lerp(1380, 190, u), 0.7, (u) => 0.48 * expDec(u, 4));
        return finalize([b], 1, { fade: 0.02 });
      },
    ],
    snap: [
      3,
      0.19,
      { room: 0.28, jit: 0.05, prio: 2 },
      (rng) => {
        const [b] = allocChannels(0.14);
        noiseBurst(b, rng, 0, 0.012, 'bp', () => 2200, 0.7, (u) => expDec(u, 4));
        modal(b, 900 + rng() * 130, 0.42, 0.032, { atk: 0.0005 });
        modal(b, 1680 + rng() * 210, 0.28, 0.022, { atk: 0.0004 });
        noiseBurst(b, rng, 0.004, 0.055, 'bp', () => 1320, 0.9, (u) => 0.22 * expDec(u, 5));
        return finalize([b], 1, { fade: 0.008 });
      },
    ],
    pop: [
      4,
      0.14,
      { room: 0.2, jit: 0.08, prio: 2 },
      (rng) => {
        const [b] = allocChannels(0.12);
        const f0 = 220 + rng() * 45;
        sweep(
          b,
          0,
          0.072,
          (u) => f0 + 540 * u * u,
          (u) => expDec(u, 3.1) * Math.min(1, u * 16) * (1 - u)
        );
        noiseBurst(b, rng, 0, 0.006, 'bp', () => 920, 0.8, (u) => 0.2 * (1 - u));
        return finalize([b], 1, { fade: 0.01 });
      },
    ],
    drip: [
      4,
      0.13,
      { room: 0.12, hall: 0.34, jit: 0.08, prio: 3 },
      (rng, v) => {
        const [b] = allocChannels(0.32);
        const f0 = 600 + v * 125 + rng() * 45;
        modal(b, 1950, 0.12, 0.01);
        sweep(
          b,
          0.012,
          0.2,
          (u) => f0 * (1 + 0.78 * u * u),
          (u) => expDec(u, 4.4) * Math.min(1, u * 22) * (u > 0.9 ? (1 - u) * 10 : 1)
        );
        sweep(
          b,
          0.095,
          0.14,
          (u) => f0 * 1.68 * (1 + 0.5 * u * u),
          (u) => 0.26 * expDec(u, 5) * Math.min(1, u * 20) * (u > 0.9 ? (1 - u) * 10 : 1)
        );
        return finalize([b], 1, { fade: 0.015 });
      },
    ],
    riser: [
      1,
      0.18,
      { hall: 0.28, jit: 0, prio: 4 },
      function* (rng) {
        const [L, R] = allocChannels(2.4, 2);
        for (const [ch, det] of [
          [L, 1],
          [R, 1.004],
        ]) {
          for (let s = 0; s < 5; s++) {
            sweep(
              ch,
              0,
              2.3,
              (u) => H(4) * det * Math.pow(2, (s + u * 1.25) % 5) * (1 + 0.002 * s),
              (u) => {
                const cyc = ((s + u * 1.25) % 5) / 5;
                const bell = Math.sin(Math.PI * cyc);
                const tail = u > 0.96 ? (1 - u) / 0.04 : 1;
                return (0.22 * bell * bell * Math.pow(u, 1.7) * tail) / (1 + cyc * 2.3);
              }
            );
            yield;
          }
          noiseBurst(
            ch,
            rng,
            0,
            2.3,
            'bp',
            (u) => 280 * Math.pow(9.5, u),
            1.1,
            (u) => 0.22 * Math.pow(u, 2.3) * (u > 0.96 ? (1 - u) / 0.04 : 1)
          );
          yield;
        }
        return finalize([L, R], 1, { fade: 0.06 });
      },
    ],
    shimmer: [
      2,
      0.11,
      { hall: 0.58, jit: 0, prio: 3 },
      (rng) => {
        const [L, R] = allocChannels(2.2, 2);
        const harm = [16, 18, 20, 22, 24, 27, 30, 32, 36, 40, 44, 48];
        for (let i = 0; i < 44; i++) {
          const f = H(harm[Math.floor(rng() * harm.length)] * (rng() < 0.24 ? 2 : 1));
          const at = Math.pow(rng(), 1.4) * 1.2;
          const amp = (0.2 + rng() * 0.5) * (720 / (f + 420));
          const pan = rng();
          modal(L, f * (1 + (rng() - 0.5) * 0.002), amp * (1 - pan), 0.5 + rng() * 0.55, {
            at,
            atk: 0.006,
            ph: rng() * TAU,
          });
          modal(R, f * (1 + (rng() - 0.5) * 0.002), amp * pan, 0.5 + rng() * 0.55, {
            at,
            atk: 0.006,
            ph: rng() * TAU,
          });
        }
        return finalize([L, R], 1, { fade: 0.25 });
      },
    ],
    chime: [
      2,
      0.14,
      { hall: 0.48, jit: 0, prio: 3 },
      (rng) => {
        const [L, R] = allocChannels(3.4, 2);
        const f0 = H(16); // D5
        const partials = [
          [0.5, 0.28, 3.0],
          [1.0, 0.92, 2.8],
          [1.499, 0.22, 1.8],
          [2.0, 0.38, 1.9],
          [2.756, 0.18, 1.0],
          [4.07, 0.1, 0.6],
          [5.43, 0.05, 0.32],
        ];
        for (const [r, a, d] of partials) {
          for (const ch of [L, R]) {
            modal(ch, f0 * r * (1 + (rng() - 0.5) * 0.0018), a, d, { atk: 0.003, ph: rng() * 0.7 });
          }
        }
        return finalize([L, R], 1, { fade: 0.35 });
      },
    ],
    boom: [
      2,
      0.38,
      { hall: 0.32, jit: 0.03, prio: 3 },
      function* (rng) {
        const [L, R] = allocChannels(2.4, 2);
        for (const [ch, det] of [
          [L, 1],
          [R, 1.003],
        ]) {
          sweep(
            ch,
            0,
            2.3,
            (u) => (D1 + 48 * expDec(u, 38)) * det,
            (u) => expDec(u, 3.0) * Math.min(1, u * 240)
          );
          sweep(
            ch,
            0,
            1.25,
            (u) => (D1 * 2 + 32 * expDec(u, 22)) * det,
            (u) => 0.62 * expDec(u, 4.1) * Math.min(1, u * 160)
          );
          modal(ch, H(3) * det, 0.34, 0.72, { atk: 0.01 });
          modal(ch, H(4.5) * det, 0.17, 0.46, { atk: 0.008 });
          yield;
          noiseBurst(ch, rng, 0, 1.9, 'lp', (u) => 85 + 560 * expDec(u, 6), 0.6, (u) => 0.82 * expDec(u, 3.3));
          yield;
          noiseBurst(ch, rng, 0, 0.11, 'lp', (u) => lerp(1750, 280, u), 0.7, (u) => 0.32 * expDec(u, 3));
        }
        for (const ch of [L, R]) {
          for (let i = 0; i < ch.length; i++) ch[i] = Math.tanh(ch[i] * 1.7);
        }
        return finalize([L, R], 1, { fade: 0.2 });
      },
    ],
    sub: [
      1,
      0.32,
      { jit: 0, prio: 3 },
      () => {
        const [b] = allocChannels(2.0);
        sweep(
          b,
          0,
          1.95,
          (u) => H(1) * (1 + 0.15 * Math.pow(Math.sin(Math.PI * u), 2)),
          (u) => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.55)), 2)
        );
        sweep(
          b,
          0,
          1.95,
          () => H(2),
          (u) => 0.38 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.6)), 2)
        );
        sweep(
          b,
          0,
          1.95,
          () => H(3),
          (u) => 0.12 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.65)), 2)
        );
        return finalize([b], 1, { fade: 0.2 });
      },
    ],
    creak: [
      4,
      0.16,
      { room: 0.34, hall: 0.14, jit: 0.1, prio: 3 },
      (rng) => {
        const [out] = allocChannels(1.3);
        const exc = new Float32Array(out.length);
        let t = 0.02;
        const r0 = 32 + rng() * 24;
        const r1 = r0 * (1.5 + rng());
        while (t < 1.12) {
          const u = t / 1.12;
          const rate = lerp(r0, r1, Math.sin(u * Math.PI * (0.6 + 0.4 * rng()))) * (1 + 0.12 * Math.sin(u * 23));
          const amp = Math.sin(Math.PI * Math.min(1, u * 1.02)) * (0.5 + 0.5 * rng());
          const idx = Math.floor(t * SR_SFX);
          for (let k = 0; k < 40 && idx + k < exc.length; k++) {
            exc[idx + k] += amp * (rng() * 2 - 1) * 0.4 + (k < 14 ? amp : 0);
          }
          t += (1 / Math.max(10, rate)) * (0.85 + 0.3 * rng());
        }
        const bank = [
          [310 + rng() * 60, 14, 1.0],
          [540 + rng() * 90, 18, 0.9],
          [890 + rng() * 120, 16, 0.62],
          [1380 + rng() * 150, 14, 0.36],
          [2300, 8, 0.16],
        ].map(([f, q, w]) => [new SVF(f, q, SR_SFX), w]);
        for (let i = 0; i < out.length; i++) {
          let sum = 0;
          const x = exc[i];
          for (let j = 0; j < bank.length; j++) {
            bank[j][0].run(x);
            sum += bank[j][0].bp * bank[j][1];
          }
          out[i] = sum;
        }
        return finalize([out], 1, { fade: 0.05 });
      },
    ],
    wave: [
      2,
      0.16,
      { hall: 0.16, jit: 0.06, prio: 3 },
      function* (rng) {
        const [L, R] = allocChannels(3.6, 2);
        const crest = (u) => (u < 0.38 ? Math.pow(ss(u / 0.38), 1.6) : Math.pow(1 - (u - 0.38) / 0.62, 2.1));
        for (const [ch, off] of [
          [L, 0],
          [R, 0.04],
        ]) {
          noiseBurst(ch, rng, off, 3.45, 'lp', (u) => 170 + 1520 * crest(u), 0.6, (u) => crest(u));
          yield;
          noiseBurst(
            ch,
            rng,
            off + 0.22,
            3.2,
            'bp',
            (u) => 3600 - 1300 * u,
            0.7,
            (u) => 0.16 * Math.pow(crest(u), 1.4) * (0.7 + 0.3 * Math.sin(u * 58 + off * 40))
          );
          yield;
          noiseBurst(ch, rng, 0, 3.3, 'lp', () => 125, 0.7, (u) => 0.9 * crest(u));
        }
        return finalize([L, R], 1, { fade: 0.2 });
      },
    ],
    paper: [
      5,
      0.16,
      { room: 0.26, jit: 0.08, prio: 2 },
      (rng, v) => {
        const [b] = allocChannels(0.48);
        fibres(b, rng, 0, 0.32 + 0.1 * rng(), 260, (u) => Math.pow(u, 1.45), 1, 1400, 5200);
        noiseBurst(
          b,
          rng,
          0,
          0.25,
          'bp',
          (u) => 2250 + 920 * Math.sin(u * 9 + v),
          0.7,
          (u) => 0.08 * Math.sin(Math.PI * Math.pow(u, 0.6)) * (0.6 + 0.4 * Math.sin(u * 45 + v))
        );
        return finalize([b], 1, { fade: 0.05 });
      },
    ],
    slam: [
      2,
      0.42,
      { hall: 0.4, room: 0.22, jit: 0.02, prio: 3 },
      function* (rng) {
        const [L, R] = allocChannels(2.6, 2);
        for (const [ch, det] of [
          [L, 1],
          [R, 1.004],
        ]) {
          sweep(
            ch,
            0,
            1.9,
            (u) => (38 + 72 * expDec(u, 34)) * det,
            (u) => 1.12 * expDec(u, 4) * Math.min(1, u * 400)
          );
          modal(ch, 98 * det, 0.72, 0.62, { atk: 0.002 });
          modal(ch, 161 * det, 0.52, 0.44, { atk: 0.002 });
          modal(ch, 247 * det, 0.34, 0.3, { atk: 0.0015 });
          modal(ch, 392 * det, 0.14, 0.16);
          yield;
          noiseBurst(
            ch,
            rng,
            0,
            0.16,
            'lp',
            (u) => 480 + 3100 * expDec(u, 5),
            0.6,
            (u) => 0.85 * expDec(u, 4.5) * Math.min(1, u * 120)
          );
          yield;
          noiseBurst(ch, rng, 0.02, 2.3, 'lp', (u) => 110 + 920 * expDec(u, 7), 0.6, (u) => 0.5 * expDec(u, 3.6));
          yield;
          fibres(ch, rng, 0.05, 0.8, 125, (u) => Math.pow(u, 1.2), 0.14, 1200, 4200);
        }
        for (const ch of [L, R]) {
          for (let i = 0; i < ch.length; i++) ch[i] = Math.tanh(ch[i] * 1.35);
        }
        return finalize([L, R], 1, { fade: 0.28 });
      },
    ],
    // Internal physical transition foley
    _flap: [
      5,
      0.16,
      { room: 0.22, jit: 0.06, prio: 2, gap: 0.005 },
      (rng) => {
        const [b] = allocChannels(0.09);
        const k = 1 + (rng() - 0.5) * 0.12;
        modal(b, 1460 * k, 0.48, 0.024, { atk: 0.0004 });
        modal(b, 680 * k, 0.42, 0.03, { atk: 0.0008 });
        noiseBurst(b, rng, 0, 0.006, 'bp', () => 2400 * k, 0.8, (u) => 0.55 * (1 - u));
        return finalize([b], 1, { fade: 0.006 });
      },
    ],
    _crease: [
      4,
      0.18,
      { room: 0.24, jit: 0.05, prio: 2 },
      (rng) => {
        const [b] = allocChannels(0.28);
        fibres(b, rng, 0, 0.2, 220, (u) => Math.sin(Math.PI * u), 0.85, 1600, 4800);
        noiseBurst(b, rng, 0.14, 0.05, 'bp', (u) => lerp(1900, 950, u), 0.85, (u) => 0.65 * expDec(u, 5));
        modal(b, 420 + rng() * 60, 0.3, 0.05, { at: 0.16, atk: 0.002 });
        return finalize([b], 1, { fade: 0.02 });
      },
    ],
    _plop: [
      2,
      0.16,
      { room: 0.15, hall: 0.22, jit: 0.04, prio: 2 },
      (rng) => {
        const [b] = allocChannels(0.22);
        sweep(b, 0, 0.12, (u) => 120 + 260 * u * u, (u) => expDec(u, 4.5) * Math.min(1, u * 30));
        modal(b, 320 + rng() * 30, 0.32, 0.09, { at: 0.02, atk: 0.003 });
        return finalize([b], 1, { fade: 0.02 });
      },
    ],
    _page: [
      3,
      0.12,
      { room: 0.18, jit: 0.06, prio: 1 },
      (rng) => {
        const [b] = allocChannels(0.24);
        noiseBurst(b, rng, 0, 0.2, 'bp', (u) => lerp(1400, 2900, u), 0.8, (u) => Math.sin(Math.PI * u) * 0.45);
        fibres(b, rng, 0.02, 0.16, 150, (u) => Math.sin(Math.PI * u), 0.5, 1500, 4400);
        return finalize([b], 1, { fade: 0.02 });
      },
    ],
  };

  // Alias bell -> chime
  SFX_SPECS.bell = SFX_SPECS.chime;

  // Looping pad/noise table definitions
  const PAD_SPECS = {
    pink: { f: 1, prio: 1, gen: () => genNoiseLoop('pink', 4.0, 201) },
    brown: { f: 1, prio: 1, gen: () => genNoiseLoop('brown', 4.0, 202) },
    hiss: { f: 1, prio: 2, gen: () => genNoiseLoop('hiss', 3.5, 203) },
    rip: { f: 1, prio: 3, gen: () => genNoiseLoop('rip', 3.5, 204) },
    low: {
      f: H(2),
      prio: 1,
      gen: () =>
        genPeriodicPad({
          f: H(2),
          partials: [
            [0.5, 0.72, 2],
            [1, 1.0, 3],
            [1.5, 0.28, 2],
            [2, 0.34, 3],
            [3, 0.12, 2],
          ],
          dur: 4.0,
          seed: 301,
          rms: 0.16,
          detune: 0.003,
        }),
    },
    warm: {
      f: H(4),
      prio: 1,
      gen: () =>
        genPeriodicPad({
          f: H(4),
          partials: [
            [1, 1.0, 3],
            [2, 0.48, 3],
            [3, 0.24, 3],
            [4, 0.12, 2],
            [5, 0.07, 2],
            [6, 0.04, 2],
          ],
          dur: 4.0,
          seed: 302,
          rms: 0.13,
          detune: 0.004,
        }),
    },
    strings: {
      f: H(6),
      prio: 2,
      gen: () =>
        genPeriodicPad({
          f: H(6),
          partials: [
            [1, 0.9, 4],
            [2, 0.62, 4],
            [3, 0.44, 3],
            [4, 0.28, 3],
            [5, 0.18, 2],
            [6, 0.11, 2],
            [7, 0.06, 2],
          ],
          dur: 4.0,
          seed: 303,
          rms: 0.12,
          spread: 0.6,
          detune: 0.0055,
        }),
    },
    organ: {
      f: H(4),
      prio: 2,
      gen: () =>
        genPeriodicPad({
          f: H(4),
          partials: [
            [0.5, 0.4, 2],
            [1, 1.0, 2],
            [2, 0.7, 2],
            [3, 0.35, 2],
            [4, 0.28, 2],
            [6, 0.14, 2],
          ],
          dur: 4.0,
          seed: 304,
          rms: 0.13,
          spread: 0.3,
          detune: 0.0018,
        }),
    },
    choir: {
      f: H(8),
      prio: 3,
      gen: () =>
        genPeriodicPad({
          f: H(8),
          partials: [
            [1, 0.85, 4],
            [2, 0.52, 4],
            [3, 0.42, 4],
            [4, 0.16, 3],
            [5, 0.12, 3],
          ],
          dur: 4.0,
          seed: 305,
          rms: 0.11,
          spread: 0.7,
          detune: 0.006,
        }),
    },
    hum: {
      f: H(3),
      prio: 2,
      gen: () =>
        genPeriodicPad({
          f: H(3),
          partials: [
            [1, 1.0, 2],
            [2, 0.38, 2],
            [3, 0.16, 2],
            [4, 0.08, 1],
          ],
          dur: 3.5,
          seed: 306,
          rms: 0.14,
          spread: 0.2,
          detune: 0.0015,
        }),
    },
    solo: {
      f: H(12),
      prio: 2,
      gen: () =>
        genPeriodicPad({
          f: H(12),
          partials: [
            [1, 1.0, 3],
            [2, 0.35, 3],
            [3, 0.18, 2],
            [4, 0.08, 2],
          ],
          dur: 3.5,
          seed: 307,
          rms: 0.11,
          spread: 0.5,
          detune: 0.004,
        }),
    },
    sine: {
      f: H(12),
      prio: 2,
      gen: () =>
        genPeriodicPad({
          f: H(12),
          partials: [[1, 1.0, 1]],
          dur: 3.0,
          seed: 308,
          rms: 0.14,
          spread: 0.0,
          detune: 0,
        }),
    },
  };

  // ---------------------------------------------------------------------------
  // Non-blocking Incremental Offline Buffer Bank
  // ---------------------------------------------------------------------------
  function createBank() {
    const cache = new Map();
    const tasks = {};
    const queue = [];
    const urgent = [];
    let cur = null;
    let timer = 0;

    function addTask(key, prio, fn) {
      tasks[key] = fn;
      queue.push({ key, prio });
    }

    // Register SFX tasks
    for (const name of Object.keys(SFX_SPECS)) {
      if (name === 'bell') continue;
      const [vars, , meta, synth] = SFX_SPECS[name];
      for (let v = 0; v < vars; v++) {
        const key = `hit.${name}.${v}`;
        const seed = hashKey(key);
        addTask(key, (meta.prio || 2) + (v > 0 ? 2 : 0), () => synth(mulberry32(seed), v));
      }
    }
    // Register Pad tasks
    for (const name of Object.keys(PAD_SPECS)) {
      const spec = PAD_SPECS[name];
      addTask(`pad.${name}`, spec.prio + 1, spec.gen);
    }
    // Register IR tasks
    addTask('ir.room', 1, () => genIR({ dur: 1.0, decay: 0.72, bright: 5200, preDelay: 0.008, seed: 801 }));
    addTask('ir.hall', 2, () => genIR({ dur: 2.8, decay: 2.4, bright: 4200, preDelay: 0.022, seed: 802 }));

    queue.sort((a, b) => a.prio - b.prio);

    function hashKey(str) {
      let h = 2166136261 >>> 0;
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
      }
      return h || 1;
    }

    function toAudioBuffer(raw) {
      if (!raw || typeof AudioBuffer === 'undefined') return null;
      const len = raw.ch[0].length;
      const buf = new AudioBuffer({
        length: len,
        numberOfChannels: raw.ch.length,
        sampleRate: raw.sr,
      });
      for (let c = 0; c < raw.ch.length; c++) {
        buf.copyToChannel(raw.ch[c], c);
      }
      if (raw.f) buf._baseFreq = raw.f;
      return buf;
    }

    function startTask(key) {
      if (cache.has(key) || !tasks[key]) return;
      const res = tasks[key]();
      if (res && typeof res.next === 'function') {
        cur = { key, gen: res };
      } else {
        const buf = toAudioBuffer(res);
        if (buf) cache.set(key, buf);
      }
    }

    function stepCur() {
      if (!cur) return false;
      const r = cur.gen.next();
      if (r.done) {
        const buf = toAudioBuffer(r.value);
        if (buf) cache.set(cur.key, buf);
        cur = null;
      }
      return true;
    }

    function pump(budgetMs = 3.5) {
      const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      while (true) {
        if (cur) {
          stepCur();
        } else {
          let nextKey = null;
          while (urgent.length && !nextKey) {
            const k = urgent.shift();
            if (!cache.has(k) && tasks[k]) nextKey = k;
          }
          while (queue.length && !nextKey) {
            const item = queue.shift();
            if (!cache.has(item.key) && tasks[item.key]) nextKey = item.key;
          }
          if (!nextKey) return false;
          startTask(nextKey);
        }
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (now - t0 >= budgetMs) return true;
      }
    }

    return {
      get(key) {
        return cache.get(key) || null;
      },
      need(key) {
        if (!cache.has(key) && tasks[key] && !urgent.includes(key)) {
          urgent.unshift(key);
          this.run();
        }
      },
      sync(key) {
        if (cache.has(key)) return cache.get(key);
        if (!tasks[key]) return null;
        const saved = cur;
        cur = null;
        startTask(key);
        while (cur) stepCur();
        cur = saved;
        return cache.get(key) || null;
      },
      run() {
        if (timer || typeof AudioBuffer === 'undefined') return;
        const tick = () => {
          timer = 0;
          try {
            if (pump(urgent.length ? 6 : 3)) {
              timer = setTimeout(tick, 18);
            }
          } catch {
            timer = 0;
          }
        };
        timer = setTimeout(tick, 80);
      },
    };
  }

  // ---------------------------------------------------------------------------
  // WebAudio Graph Engine (Master Limiter + Hall/Room Convolvers + Voice Pool)
  // ---------------------------------------------------------------------------
  function createGraph(ctx, bank) {
    const gain = (v = 1) => {
      const g = ctx.createGain();
      g.gain.value = v;
      return g;
    };

    const sum = gain(1);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -15;
    comp.knee.value = 10;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;

    const makeDown = gain(0.62);
    const shaper = ctx.createWaveShaper();
    {
      const curve = new Float32Array(4097);
      const knee = 0.34;
      const ceil = 0.65;
      for (let i = 0; i < 4097; i++) {
        const x = (i / 4096) * 2 - 1;
        const a = Math.abs(x);
        const y = a < knee ? a : knee + (ceil - knee) * Math.tanh((a - knee) / (ceil - knee));
        curve[i] = Math.sign(x) * y;
      }
      shaper.curve = curve;
    }

    const master = gain(1);
    sum.connect(comp);
    comp.connect(makeDown);
    makeDown.connect(shaper);
    shaper.connect(master);
    master.connect(ctx.destination);

    const bedBus = gain(1);
    const hitBus = gain(1);
    const trBus = gain(1);
    bedBus.connect(sum);
    hitBus.connect(sum);
    trBus.connect(sum);

    const hallSend = gain(1);
    const roomSend = gain(1);
    let hallReady = false;
    let roomReady = false;

    function matchSR(buf) {
      if (!buf || buf.sampleRate === ctx.sampleRate) return buf;
      const copy = ctx.createBuffer(buf.numberOfChannels, buf.length, ctx.sampleRate);
      for (let c = 0; c < buf.numberOfChannels; c++) {
        copy.copyToChannel(buf.getChannelData(c), c);
      }
      return copy;
    }

    function ready(roomOnly = false) {
      if (!roomReady) {
        const ir = matchSR(bank.get('ir.room'));
        if (ir) {
          const conv = ctx.createConvolver();
          conv.buffer = ir;
          const out = gain(0.75);
          roomSend.connect(conv);
          conv.connect(out);
          out.connect(sum);
          roomReady = true;
        }
      }
      if (!roomOnly && !hallReady) {
        const ir = matchSR(bank.get('ir.hall'));
        if (ir) {
          const conv = ctx.createConvolver();
          conv.buffer = ir;
          const out = gain(0.95);
          hallSend.connect(conv);
          conv.connect(out);
          out.connect(sum);
          hallReady = true;
        }
      }
    }

    function hold(param, t) {
      try {
        if (param.cancelAndHoldAtTime) {
          param.cancelAndHoldAtTime(t);
        } else {
          const v = param.value;
          param.cancelScheduledValues(t);
          param.setValueAtTime(v, t);
        }
      } catch {}
    }

    function curve(param, t0, dur, pts, exp = false) {
      if (!pts || !pts.length) return;
      param.setValueAtTime(exp ? Math.max(1e-4, pts[0][1]) : pts[0][1], t0 + pts[0][0] * dur);
      for (let i = 1; i < pts.length; i++) {
        const t = t0 + pts[i][0] * dur;
        const v = pts[i][1];
        if (exp) {
          param.exponentialRampToValueAtTime(Math.max(1e-4, v), t);
        } else {
          param.linearRampToValueAtTime(v, t);
        }
      }
    }

    function group(bus, { g = 1, mid = 0.25, wet = 0.6, room = 0 } = {}) {
      const out = gain(g);
      const send = gain(g);
      const dry = gain(1);
      const midIn = gain(1);
      const wetIn = gain(1);
      const midSend = gain(mid);
      const wetSend = gain(wet);
      out.connect(bus);
      send.connect(hallSend);
      dry.connect(out);
      midIn.connect(out);
      wetIn.connect(out);
      midIn.connect(midSend);
      wetIn.connect(wetSend);
      midSend.connect(send);
      wetSend.connect(send);
      let rSend = null;
      if (room) {
        rSend = gain(room);
        out.connect(rSend);
        rSend.connect(roomSend);
      }
      return {
        dry,
        mid: midIn,
        wet: wetIn,
        out,
        send,
        fade(val, at, dur) {
          for (const p of [out.gain, send.gain]) {
            try {
              const now = ctx.currentTime;
              const start = Math.max(now, at);
              const cur = p.value;
              p.cancelScheduledValues(now);
              if (start > now + 0.01) p.setValueAtTime(cur, now);
              p.setValueAtTime(cur, start);
              p.linearRampToValueAtTime(val, start + Math.max(0.01, dur));
            } catch {}
          }
        },
        free() {
          for (const n of [out, send, dry, midIn, wetIn, midSend, wetSend, rSend]) {
            if (n) {
              try {
                n.disconnect();
              } catch {}
            }
          }
        },
      };
    }

    function play(buf, at, { g = 1, rate = 1, pan = 0, to, dur = 0, loop = false, offset = 0, lp = 0, hp = 0, atk = 0, rel = 0 } = {}) {
      if (!buf) return null;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = clamp(rate, 0.1, 8);
      src.loop = loop;
      let head = src;
      let fLp = null;
      let fHp = null;
      if (lp) {
        fLp = ctx.createBiquadFilter();
        fLp.type = 'lowpass';
        fLp.frequency.value = lp;
        fLp.Q.value = 0.55;
        head.connect(fLp);
        head = fLp;
      }
      if (hp) {
        fHp = ctx.createBiquadFilter();
        fHp.type = 'highpass';
        fHp.frequency.value = hp;
        fHp.Q.value = 0.55;
        head.connect(fHp);
        head = fHp;
      }
      const gn = gain(g);
      head.connect(gn);
      head = gn;
      let pnr = null;
      if (pan && ctx.createStereoPanner) {
        pnr = ctx.createStereoPanner();
        pnr.pan.value = clamp(pan, -1, 1);
        head.connect(pnr);
        head = pnr;
      }
      head.connect(to || hitBus);
      const t = Math.max(at, ctx.currentTime);
      if (atk) {
        gn.gain.setValueAtTime(0, t);
        gn.gain.linearRampToValueAtTime(g, t + atk);
      }
      src.start(t, offset % Math.max(0.01, buf.duration));
      if (dur) {
        if (rel) {
          gn.gain.setValueAtTime(g, Math.max(t, t + dur - rel));
          gn.gain.linearRampToValueAtTime(0, t + dur);
        }
        src.stop(t + dur + 0.02);
      }
      src.onended = () => {
        for (const n of [src, gn, fLp, fHp, pnr]) {
          if (n) {
            try {
              n.disconnect();
            } catch {}
          }
        }
      };
      return { src, g: gn.gain, lp: fLp && fLp.frequency, hp: fHp && fHp.frequency, pan: pnr && pnr.pan, t };
    }

    const lastVar = {};
    function rawHit(name, at, opts = {}) {
      const canonical = name === 'bell' ? 'chime' : name;
      const spec = SFX_SPECS[canonical];
      if (!spec) return null;
      const vars = spec[0];
      let v = opts.v != null ? opts.v % vars : Math.floor(Math.random() * vars);
      if (opts.v == null && vars > 1 && v === lastVar[canonical]) v = (v + 1) % vars;
      lastVar[canonical] = v;
      const key = `hit.${canonical}.${v}`;
      let buf = bank.get(key);
      if (!buf) {
        for (let i = 0; i < vars && !buf; i++) buf = bank.get(`hit.${canonical}.${i}`);
        if (!buf) buf = bank.sync(key);
        else bank.need(key);
      }
      const g = (opts.g == null ? 1 : opts.g) * spec[1];
      return play(buf, at, { ...opts, g });
    }

    class PadVoice {
      constructor(name, freq, { g = 0.2, atk = 2, lp = 0, hp = 0, pan = 0, to = bedBus, drift = 0.2, q = 0.6 } = {}) {
        this.name = name;
        this.f = freq;
        this.g = g;
        this.atk = atk;
        this.lp0 = lp;
        this.hp0 = hp;
        this.pan = pan;
        this.to = to;
        this.drift = drift;
        this.q = q;
        this.ph = Math.random() * TAU;
        this.sp = 0.1 + Math.random() * 0.2;
        this.dead = false;
        this.src = null;
        this.nodes = [];
        this.begin();
      }
      begin() {
        if (this.dead || this.src) return;
        const key = `pad.${this.name}`;
        const buf = bank.get(key);
        if (!buf) {
          bank.need(key);
          return;
        }
        const now = ctx.currentTime;
        const baseF = buf._baseFreq || PAD_SPECS[this.name].f || 1;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.playbackRate.value = clamp(this.f / baseF, 0.12, 8);
        let head = src;
        const nodes = [src];
        if (this.lp0) {
          const f = ctx.createBiquadFilter();
          f.type = 'lowpass';
          f.frequency.value = this.lp0;
          f.Q.value = this.q;
          head.connect(f);
          head = f;
          this.F = f;
          nodes.push(f);
        }
        if (this.hp0) {
          const f = ctx.createBiquadFilter();
          f.type = 'highpass';
          f.frequency.value = this.hp0;
          f.Q.value = 0.55;
          head.connect(f);
          head = f;
          this.HP = f;
          nodes.push(f);
        }
        const A = gain(0);
        head.connect(A);
        head = A;
        this.A = A;
        nodes.push(A);

        const D = gain(1);
        head.connect(D);
        head = D;
        this.D = D;
        nodes.push(D);

        if (this.pan && ctx.createStereoPanner) {
          const p = ctx.createStereoPanner();
          p.pan.value = clamp(this.pan, -1, 1);
          head.connect(p);
          head = p;
          nodes.push(p);
        }
        head.connect(this.to);
        src.start(now, Math.random() * buf.duration);
        this.src = src;
        this.nodes = nodes;
        A.gain.setValueAtTime(0, now);
        if (this.g > 0) {
          A.gain.setTargetAtTime(this.g, now, Math.max(0.015, this.atk / 3));
        }
      }
      set(v, tau = 0.9) {
        if (this.dead) return this;
        this.g = v;
        if (!this.src) {
          this.atk = tau * 3;
          return this;
        }
        const now = ctx.currentTime;
        hold(this.A.gain, now);
        this.A.gain.setTargetAtTime(v, now, Math.max(0.01, tau));
        return this;
      }
      freq(f, tau = 0.08) {
        this.f = f;
        if (this.src) {
          const baseF = (this.src.buffer && this.src.buffer._baseFreq) || PAD_SPECS[this.name].f || 1;
          this.src.playbackRate.setTargetAtTime(clamp(f / baseF, 0.12, 8), ctx.currentTime, tau);
        }
        return this;
      }
      cut(f, tau = 0.6) {
        this.lp0 = f;
        if (this.F) this.F.frequency.setTargetAtTime(clamp(f, 40, 18000), ctx.currentTime, tau);
        return this;
      }
      breathe(t) {
        if (this.dead) return;
        if (!this.src) {
          this.begin();
          return;
        }
        if (this.drift && this.D) {
          const mod =
            1 +
            this.drift *
              (0.65 * Math.sin(t * this.sp * TAU + this.ph) +
                0.35 * Math.sin(t * this.sp * 2.71 * TAU + this.ph * 2));
          this.D.gain.setTargetAtTime(Math.max(0.1, mod), ctx.currentTime, 0.25);
        }
      }
      kill(at = ctx.currentTime, rel = 0.4) {
        if (this.dead) return;
        this.dead = true;
        if (!this.src) return;
        try {
          hold(this.A.gain, at);
          this.A.gain.setTargetAtTime(0, at, Math.max(0.02, rel / 4));
          this.src.stop(at + rel * 1.6 + 0.06);
          const ns = this.nodes;
          this.src.onended = () => {
            for (const n of ns) {
              try {
                n.disconnect();
              } catch {}
            }
          };
        } catch {}
      }
    }

    return {
      ctx,
      bank,
      get now() {
        return ctx.currentTime;
      },
      master,
      bedBus,
      hitBus,
      trBus,
      hall: hallSend,
      room: roomSend,
      ready,
      group,
      curve,
      play,
      rawHit,
      pad: (name, f, opts) => new PadVoice(name, f, opts),
    };
  }

  // ---------------------------------------------------------------------------
  // Scene-Aware Musical Beds for 《最后半个像素》 (all 10 scenes)
  // ---------------------------------------------------------------------------
  // Scene beds are data-driven: SC.BEDS[sceneId] = { trim, mix:[mid,wet,room], voices:[...] }
  // voice: { pad, h, g, lp, hp, pan, bus, drift, steps: {beat: gainMul}, cuts: {beat: lp} }
  function stepVal(table, beat, fallback) {
    if (!table) return fallback;
    let best = fallback;
    let bestKey = -Infinity;
    for (const k in table) {
      const key = +k;
      if (key <= beat && key > bestKey) {
        bestKey = key;
        best = table[k];
      }
    }
    return best;
  }

  function createSceneBed(E, sceneId, beat, fadeIn = 1.1) {
    const spec = (SC.BEDS && SC.BEDS[sceneId]) || null;
    const mix = (spec && spec.mix) || [0.32, 0.65, 0.12];
    const trim = spec && spec.trim != null ? spec.trim : 0.7;
    const grp = E.group(E.bedBus, { g: 0, mid: mix[0], wet: mix[1], room: mix[2] });
    const voices = {};
    const defs = (spec && spec.voices) || [['low', 2, 0.18]];
    defs.forEach((v, i) => {
      const id = 'v' + i;
      const bus = grp[v.bus || 'mid'] || grp.mid;
      voices[id] = E.pad(v.pad, v.f != null ? v.f : H(v.h || 2), {
        g: 0,
        atk: fadeIn,
        to: bus,
        drift: v.drift != null ? v.drift : 0.2,
        lp: v.lp || 0,
        hp: v.hp || 0,
        pan: v.pan || 0,
      });
    });
    const levelOf = (v, b) => (v.g != null ? v.g : 0.12) * stepVal(v.steps, b, 1);

    const now = E.now;
    defs.forEach((v, i) => {
      const voice = voices['v' + i];
      const g = levelOf(v, beat);
      if (g > 0) voice.set(g, Math.max(0.25, fadeIn / 2));
      const lp = stepVal(v.cuts, beat, v.lp || 0);
      if (lp) voice.cut(lp, 0.4);
    });
    grp.fade(trim, now, Math.max(0.25, fadeIn));
    let endAt = Infinity;

    return {
      g: grp,
      trim,
      get endAt() {
        return endAt;
      },
      accent(b) {
        defs.forEach((v, i) => {
          const voice = voices['v' + i];
          voice.set(levelOf(v, b), 1.0);
          const lp = stepVal(v.cuts, b, v.lp || 0);
          if (lp) voice.cut(lp, 1.2);
        });
      },
      tick(t) {
        for (const k in voices) voices[k].breathe(t);
      },
      stop(rel = 1.0) {
        const t = E.now;
        grp.fade(0, t, rel);
        for (const k in voices) voices[k].kill(t, rel);
        endAt = t + rel * 1.8 + 0.25;
      },
      cutAt(at, rel = 0.16) {
        grp.fade(0, at, rel);
        for (const k in voices) voices[k].kill(at, rel);
        endAt = at + rel * 1.8 + 0.25;
      },
      free() {
        grp.free();
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Physical Transition Soundscape Choreography
  // ---------------------------------------------------------------------------
  function playTransition(E, { name = 'fade', dur = 1.2, reverse = false } = {}) {
    const t0 = E.now;
    const r = Math.max(0.35, dur || 1.2);
    const rng = mulberry32((Math.floor(t0 * 1000) ^ name.length * 7919) >>> 0);
    const grp = E.group(E.trBus, { g: 0.9, mid: 0.3, wet: 0.62, room: 0.14 });
    const at = (u) => t0 + u * r;

    function noiseSweep(padName, filterType, gainPts, freqPts, { q = 0.7, panPts = null, ratePts = null, bus = 'mid' } = {}) {
      const buf = E.bank.get(`pad.${padName}`) || E.bank.sync(`pad.${padName}`);
      if (!buf) return;
      const src = E.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const flt = E.ctx.createBiquadFilter();
      flt.type = filterType;
      flt.Q.value = q;
      const gn = E.ctx.createGain();
      src.connect(flt);
      flt.connect(gn);
      let head = gn;
      let pnr = null;
      if (panPts && E.ctx.createStereoPanner) {
        pnr = E.ctx.createStereoPanner();
        head.connect(pnr);
        head = pnr;
        E.curve(pnr.pan, t0, r, panPts, false);
      }
      head.connect(grp[bus] || grp.mid);
      E.curve(gn.gain, t0, r, gainPts, false);
      E.curve(flt.frequency, t0, r, freqPts, true);
      if (ratePts) E.curve(src.playbackRate, t0, r, ratePts, true);
      const endU = gainPts[gainPts.length - 1][0];
      src.start(t0, rng() * buf.duration);
      src.stop(t0 + r * endU + 0.15);
      src.onended = () => {
        for (const n of [src, flt, gn, pnr]) {
          if (n) {
            try {
              n.disconnect();
            } catch {}
          }
        }
      };
    }

    function padSweep(padName, freq, gainPts, { lpPts = null, glPts = null, pan = 0, bus = 'wet' } = {}) {
      const buf = E.bank.get(`pad.${padName}`);
      if (!buf) {
        E.bank.need(`pad.${padName}`);
        return;
      }
      const baseF = buf._baseFreq || PAD_SPECS[padName].f || 1;
      const src = E.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = clamp(freq / baseF, 0.12, 8);
      let head = src;
      let flt = null;
      if (lpPts) {
        flt = E.ctx.createBiquadFilter();
        flt.type = 'lowpass';
        flt.Q.value = 0.6;
        head.connect(flt);
        head = flt;
        E.curve(flt.frequency, t0, r, lpPts, true);
      }
      const gn = E.ctx.createGain();
      head.connect(gn);
      head = gn;
      let pnr = null;
      if (pan && E.ctx.createStereoPanner) {
        pnr = E.ctx.createStereoPanner();
        pnr.pan.value = clamp(pan, -1, 1);
        head.connect(pnr);
        head = pnr;
      }
      head.connect(grp[bus] || grp.wet);
      E.curve(gn.gain, t0, r, gainPts, false);
      if (glPts) {
        E.curve(
          src.playbackRate,
          t0,
          r,
          glPts.map(([u, mul]) => [u, clamp((freq * mul) / baseF, 0.12, 8)]),
          true
        );
      }
      const endU = gainPts[gainPts.length - 1][0];
      src.start(t0, rng() * buf.duration);
      src.stop(t0 + r * endU + 0.15);
      src.onended = () => {
        for (const n of [src, flt, gn, pnr]) {
          if (n) {
            try {
              n.disconnect();
            } catch {}
          }
        }
      };
    }

    const hitAt = (sfx, u, opts = {}) => E.rawHit(sfx, at(u), { to: grp[opts.bus || 'mid'], ...opts });
    let totalDur = r + 3.0;

    if (reverse && name !== 'fade') {
      noiseSweep('pink', 'bandpass', [[0, 0], [0.55, 0.26], [1, 0]], [[0, 1700], [1, 320]], {
        q: 0.75,
        panPts: [[0, 0.25], [1, -0.25]],
      });
      return makeHandle();
    }

    const recipe = (SC.TRANSOUNDS && (SC.TRANSOUNDS[name] || SC.TRANSOUNDS.fade)) || null;
    if (recipe) {
      recipe({
        E, name, r, t0, rng, at, H, lerp, clamp,
        noiseSweep, padSweep, hitAt,
        setTotal: (d) => {
          totalDur = d;
        },
      });
    } else {
      noiseSweep('pink', 'bandpass', [[0, 0], [0.45, 0.14], [1, 0]], [[0, 340], [0.5, 880], [1, 380]], { q: 0.7 });
    }

    return makeHandle();
    function makeHandle() {
      return {
        end: t0 + totalDur,
        t1: t0 + r,
        fade(rel = 0.45) {
          grp.fade(0, E.now, rel);
        },
        free() {
          grp.free();
        },
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Public Factory: SC.createAudio()
  // ---------------------------------------------------------------------------
  const HARMONIC_SFX = new Set(['select', 'chime', 'bell', 'shimmer', 'riser']);

  function createAudio() {
    const state = {
      scene: '',
      beat: 0,
      E: null,
      bed: null,
      clock: 0,
      muted: false,
      lastHit: {},
      hitTimes: [],
      hitBuses: {},
      pendingTrans: null,
    };
    const oldBeds = [];
    const activeTrans = [];
    const params = {};
    const bank = createBank();

    if (typeof AudioBuffer !== 'undefined') {
      bank.run();
    }

    const safe = (fn) => (...args) => {
      try {
        return fn(...args);
      } catch {
        return undefined;
      }
    };

    function ensureGraph() {
      if (state.E) return state.E;
      if (typeof window === 'undefined') return null;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        const ctx = new AC({ latencyHint: 'interactive' });
        state.E = createGraph(ctx, bank);
        if (state.muted) state.E.master.gain.value = 0;
        setTimeout(safe(() => state.E && state.E.ready(true)), 300);
        setTimeout(safe(() => state.E && state.E.ready(false)), 850);
        return state.E;
      } catch {
        return null;
      }
    }

    // Reactive continuous ambient parameter layers: wind, water, hum, tension, speed, deep
    function spawnParamLayer(E, name) {
      const grp = E.group(E.bedBus, { g: 0.74, mid: 0.16, wet: 0.28 });
      const v = {};
      const mk = (k, pad, f, opts = {}) => {
        v[k] = E.pad(pad, f, { g: 0, atk: 0.35, to: grp.mid, drift: 0.22, ...opts });
      };
      if (name === 'wind') {
        mk('a', 'pink', 1, { lp: 620, hp: 160, pan: -0.32, drift: 0.4 });
        mk('b', 'pink', 1.3, { lp: 1200, hp: 420, pan: 0.35, drift: 0.55 });
        mk('c', 'brown', 1, { lp: 260, drift: 0.45 });
      } else if (name === 'water') {
        mk('a', 'brown', 1, { lp: 460, drift: 0.38 });
        mk('b', 'pink', 1, { lp: 920, hp: 150, pan: 0.25, drift: 0.55 });
        mk('c', 'hiss', 1, { lp: 4800, pan: -0.3, drift: 0.7 });
      } else if (name === 'hum') {
        mk('a', 'hum', H(3), { lp: 850, drift: 0.06 });
        mk('b', 'low', H(2), { lp: 200, drift: 0.1 });
      } else if (name === 'tension') {
        mk('a', 'solo', H(12), { lp: 1800, pan: -0.34, drift: 0.28 });
        mk('b', 'solo', H(12) * 1.059, { lp: 1800, pan: 0.34, drift: 0.36 });
        mk('c', 'low', H(1) * 1.5, { lp: 190, drift: 0.35 });
      } else if (name === 'speed') {
        mk('a', 'pink', 1, { lp: 900, hp: 120, drift: 0.15 });
        mk('b', 'pink', 1.45, { lp: 2800, hp: 680, pan: 0.3, drift: 0.25 });
        mk('c', 'brown', 1, { lp: 170, drift: 0.2 });
      } else if (name === 'deep') {
        mk('a', 'low', H(1), { lp: 140, drift: 0.16 });
        mk('b', 'brown', 1, { lp: 190, drift: 0.28 });
        mk('c', 'warm', H(3), { lp: 440, pan: 0.18, drift: 0.22 });
      }
      return { g: grp, v };
    }

    const PARAM_MOD = {
      wind: (val, t, v) => {
        const g = 0.75 + 0.25 * Math.sin(t * 0.9) * Math.sin(t * 0.37 + 1);
        v.a.set(0.32 * val * g, 0.3).cut(260 + 880 * val * g, 0.4);
        v.b.set(0.18 * val * val * g, 0.3).cut(700 + 2100 * val * g, 0.4);
        v.c.set(0.28 * val, 0.4);
      },
      water: (val, t, v) => {
        const g = 0.72 + 0.28 * Math.sin(t * 0.82);
        v.a.set(0.48 * val * g, 0.3).cut(240 + 440 * val * g, 0.4);
        v.b.set(0.28 * val * g, 0.3);
        v.c.set(0.07 * val * val * g, 0.4);
      },
      hum: (val, _t, v) => {
        v.a.set(0.09 * val, 0.25);
        v.b.set(0.22 * val, 0.3);
      },
      tension: (val, _t, v) => {
        const bend = Math.pow(2, (val * 2.0) / 12);
        v.a.set(0.07 * val * val, 0.25).freq(H(12) * bend, 0.3).cut(900 + 2400 * val, 0.3);
        v.b.set(0.055 * val * val * val, 0.3).freq(H(12) * 1.059 * bend * bend, 0.3).cut(900 + 2400 * val, 0.3);
        v.c.set(0.36 * val, 0.4);
      },
      speed: (val, _t, v) => {
        v.a.set(0.22 * val, 0.14).cut(220 + 2100 * val, 0.18);
        v.b.set(0.12 * val * val, 0.16).cut(1400 + 4200 * val, 0.22);
        v.c.set(0.42 * val, 0.22);
      },
      deep: (val, t, v) => {
        const swell = 0.8 + 0.2 * Math.sin(t * 0.42);
        v.a.set(0.42 * val * swell, 0.45);
        v.b.set(0.32 * val * swell, 0.45).cut(110 + 180 * val, 0.5);
        v.c.set(0.12 * val * val, 0.5).cut(280 + 520 * val, 0.5);
      },
    };

    function updateParams(dt) {
      const E = state.E;
      if (!E || E.ctx.state !== 'running') return;
      const t = E.now;
      for (const name in params) {
        const p = params[name];
        const live = state.clock - p.at < 0.6;
        const target = live ? p.to : 0;
        const tau = live ? 0.14 : 0.45;
        p.v += (target - p.v) * (1 - Math.exp(-dt / tau));
        if (!PARAM_MOD[name]) continue;
        if (p.v > 0.004 && !p.layer) {
          p.layer = spawnParamLayer(E, name);
        }
        if (p.layer) {
          if (t - (p.lastTick || 0) > 0.05) {
            p.lastTick = t;
            PARAM_MOD[name](p.v, t, p.layer.v);
            for (const k in p.layer.v) p.layer.v[k].breathe(t);
          }
          if (p.v < 0.002 && !live) {
            for (const k in p.layer.v) p.layer.v[k].kill(t, 0.4);
            const oldG = p.layer.g;
            p.layer = null;
            setTimeout(() => oldG.free(), 2500);
          }
        }
      }
    }

    function switchScene(sceneId, beat) {
      const E = state.E;
      if (!E) return;
      const tr = state.pendingTrans && state.pendingTrans.to === sceneId && state.clock - state.pendingTrans.at < 1.2
        ? state.pendingTrans
        : null;
      const dur = tr ? tr.dur || 1.0 : 0.95;
      state.pendingTrans = null;

      const prev = state.bed;
      const now = E.now;
      let prevRel = Math.max(0.75, dur * 0.85);
      if (tr && !tr.reverse) {
        if (tr.name === 'burn' || tr.name === 'shockwave' || tr.name === 'overexpose') prevRel = dur * 0.45;
        else if (tr.name === 'ring' || tr.name === 'zeno' || tr.name === 'zoom') prevRel = dur * 0.7;
      }
      if (prev) {
        prev.stop(prevRel);
        oldBeds.push(prev);
      }

      const next = createSceneBed(E, sceneId, beat, Math.max(1.0, dur * 1.05));
      state.bed = next;
      for (const k in params) params[k].to = 0;
    }

    const api = {
      quiet: false,

      unlock: safe(() => {
        const E = ensureGraph();
        if (!E) return;
        const ctx = E.ctx;
        if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') {
          const p = ctx.resume();
          if (p && p.catch) p.catch(() => {});
        }
      }),

      mute: safe((flag) => {
        state.muted = !!flag;
        if (state.E) {
          const g = state.E.master.gain;
          const now = state.E.now;
          g.cancelScheduledValues(now);
          g.setTargetAtTime(state.muted ? 0 : 1, now, 0.06);
        }
      }),

      emit: safe((event, data = {}) => {
        if (api.quiet) return;
        const E = state.E;
        if (!E || E.ctx.state !== 'running') return;
        if (event === 'transition') {
          for (let i = 0; i < activeTrans.length; i++) activeTrans[i].fade(0.45);
          state.pendingTrans = { ...data, at: state.clock };
          const h = playTransition(E, data);
          if (h) activeTrans.push(h);
        } else if (event === 'beat') {
          const now = E.now;
          for (let i = 0; i < activeTrans.length; i++) {
            if (now < activeTrans[i].t1 - 0.35) activeTrans[i].fade(0.75);
          }
          if (state.bed && state.bed.accent) state.bed.accent(data.beat ?? state.beat);
        } else if (event === 'back') {
          api.hit('_page', { gain: 0.45, pitch: 0.82 });
        }
      }),

      hit: safe((name, opts = {}) => {
        if (api.quiet || !name) return;
        const E = state.E;
        const canonical = name === 'bell' ? 'chime' : name;
        const spec = SFX_SPECS[canonical];
        if (!E || !spec || E.ctx.state !== 'running') return;

        const o = opts || {};
        const now = E.now;
        const meta = spec[2];
        const minGap = meta.gap ?? 0.018;
        if (now - (state.lastHit[canonical] || -1) < minGap) return;

        state.hitTimes = state.hitTimes.filter((t) => now - t < 0.12);
        if (state.hitTimes.length > 26) return;
        state.hitTimes.push(now);
        state.lastHit[canonical] = now;

        let rate = o.pitch == null ? 1 : +o.pitch;
        if (!Number.isFinite(rate) || rate === 0) rate = 1;
        else if (rate < 0) rate = Math.pow(2, rate / 12);
        rate = clamp(rate, 0.2, 4.0);
        if (HARMONIC_SFX.has(canonical)) {
          rate = snapHarmonic(rate);
        } else if (meta.jit) {
          rate *= 1 + (Math.random() * 2 - 1) * meta.jit;
        }

        const g = clamp(o.gain == null ? 1 : +o.gain || 0, 0, 1.6) * (meta.jit ? 0.92 + 0.16 * Math.random() : 1);
        const pan = clamp(+o.pan || 0, -1, 1);

        const busKey = (meta.hall ? 'h' + meta.hall : '') + (meta.room ? 'r' + meta.room : '') || 'dry';
        let bus = state.hitBuses[busKey];
        if (!bus) {
          bus = E.ctx.createGain();
          bus.connect(E.hitBus);
          if (meta.hall) {
            const s = E.ctx.createGain();
            s.gain.value = meta.hall;
            bus.connect(s);
            s.connect(E.hall);
          }
          if (meta.room) {
            const s = E.ctx.createGain();
            s.gain.value = meta.room;
            bus.connect(s);
            s.connect(E.room);
          }
          state.hitBuses[busKey] = bus;
        }
        E.rawHit(canonical, now, { g, rate, pan, to: bus });
      }),

      param: safe((name, value) => {
        if (!name || !PARAM_MOD[name]) return;
        const v = clamp(+value || 0, 0, 1);
        let p = params[name];
        if (!p) p = params[name] = { v: 0, to: 0, at: 0, layer: null, lastTick: 0 };
        p.to = v;
        p.at = state.clock;
      }),

      update: safe((dt, info = {}) => {
        const step = clamp(+dt || 0, 0, 0.1);
        state.clock += step;
        const scene = info && info.scene != null ? info.scene : state.scene;
        const beat = info && info.beat != null ? info.beat : state.beat;

        const E = state.E;
        if (!E || E.ctx.state !== 'running') {
          state.scene = scene;
          state.beat = beat;
          return;
        }

        if (E.now > 1.0) E.ready(false);

        if (scene && scene !== state.scene) {
          state.scene = scene;
          state.beat = beat;
          switchScene(scene, beat);
        } else if (beat !== state.beat) {
          state.beat = beat;
          if (state.bed && state.bed.accent) state.bed.accent(beat);
        }

        const now = E.now;
        if (state.bed) state.bed.tick(now);

        for (let i = oldBeds.length - 1; i >= 0; i--) {
          if (now > oldBeds[i].endAt) {
            oldBeds[i].free();
            oldBeds.splice(i, 1);
          }
        }
        for (let i = activeTrans.length - 1; i >= 0; i--) {
          if (now > activeTrans[i].end) {
            activeTrans[i].free();
            activeTrans.splice(i, 1);
          }
        }

        updateParams(step);
      }),
    };

    return api;
  }

  // Exported for the regression suite and for scene code that wants to validate names up front.
  SC.AUDIO_BANK = { sfx: Object.keys(SFX_SPECS), pads: Object.keys(PAD_SPECS) };
  SC.createAudio = createAudio;
})();
