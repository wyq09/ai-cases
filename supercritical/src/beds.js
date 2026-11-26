(() => {
  'use strict';
  const SC = window.__SC;

  // ===========================================================================
  // Scene beds. Everything stacks on C1 (32.7 Hz): h is a harmonic multiple.
  // The score heats up with k — cold open fifths in Act I, a tritone at the
  // criticality hinge, full organ/choir in Act III, then one pure sine on white.
  //   voice: { pad, h, g, lp, hp, pan, bus, drift, steps: { beat: gainMul }, cuts: { beat: lp } }
  // ===========================================================================
  const v = (pad, h, g, o = {}) => ({ pad, h, g, ...o });
  SC.BEDS = {
    brief: {
      trim: 0.5,
      mix: [0.3, 0.14, 0.03],
      voices: [
        v('brown', 1, 0.16, { lp: 190, drift: 0.08, bus: 'dry' }),
        v('hum', 4, 0.05, { lp: 260, drift: 0.04, bus: 'dry' }),
        v('sine', 24, 0.0, { steps: { 3: 1 }, bus: 'wet', drift: 0 }),
      ],
    },
    fold: {
      trim: 0.72,
      mix: [0.34, 0.5, 0.06],
      voices: [
        v('low', 2, 0.24, { lp: 210, drift: 0.14 }),
        v('hum', 3, 0.06, { lp: 520, drift: 0.06 }),
        v('solo', 12, 0.028, { lp: 1100, pan: 0.3, cuts: { 1: 1700, 2: 2300, 3: 3000, 4: 1900 }, drift: 0.24 }),
        v('warm', 4, 0.07, { lp: 900, pan: -0.2 }),
      ],
    },
    compute: {
      trim: 0.74,
      mix: [0.32, 0.6, 0.08],
      voices: [
        v('low', 2, 0.22, { lp: 220, drift: 0.12 }),
        v('warm', 4, 0.13, { lp: 980, pan: -0.18, drift: 0.16 }),
        v('strings', 6, 0.05, { lp: 1900, pan: 0.28, steps: { 1: 0.5, 2: 1.5, 3: 1.1 }, cuts: { 1: 1100, 2: 2600, 3: 1800 }, drift: 0.24 }),
        v('solo', 11, 0.03, { lp: 1600, pan: 0.36, steps: { 2: 1.6, 3: 0.8 }, drift: 0.3 }),
      ],
    },
    price: {
      trim: 0.72,
      mix: [0.3, 0.55, 0.06],
      voices: [
        v('low', 1, 0.34, { lp: 150, drift: 0.1 }),
        v('brown', 1, 0.14, { lp: 260, drift: 0.26 }),
        v('warm', 4, 0.11, { lp: 1700, cuts: { 1: 1100, 2: 760, 3: 520 }, drift: 0.18 }),
        v('sine', 12, 0.03, { bus: 'wet', drift: 0, steps: { 1: 0.5, 2: 0.3 } }),
      ],
    },
    horizon: {
      trim: 0.76,
      mix: [0.3, 0.66, 0.08],
      voices: [
        v('low', 2, 0.2, { lp: 230, drift: 0.12 }),
        v('strings', 6, 0.1, { lp: 900, pan: -0.22, cuts: { 1: 1900, 2: 3300, 3: 2200 }, steps: { 1: 1.4, 2: 1.2 }, drift: 0.26 }),
        v('choir', 8, 0.03, { lp: 2400, pan: 0.3, bus: 'wet', steps: { 2: 2.4, 3: 1.6 }, drift: 0.3 }),
        v('warm', 4, 0.1, { lp: 1200 }),
      ],
    },
    lab: {
      trim: 0.7,
      mix: [0.34, 0.6, 0.08],
      voices: [
        v('low', 2, 0.22, { lp: 210, drift: 0.1 }),
        v('hum', 8, 0.05, { lp: 1500, drift: 0.05 }),
        v('organ', 4, 0.07, { lp: 900, pan: -0.16, steps: { 2: 1.15, 4: 1.3, 6: 1.5, 8: 1.7, 9: 2 }, drift: 0.14 }),
        v('choir', 8, 0.02, { lp: 2600, pan: 0.3, bus: 'wet', steps: { 5: 2, 9: 4.5 }, drift: 0.3 }),
      ],
    },
    critical: {
      trim: 0.76,
      mix: [0.36, 0.5, 0.06],
      voices: [
        v('low', 1, 0.36, { lp: 150, drift: 0.08 }),
        v('solo', 12, 0.045, { lp: 2200, pan: -0.34, drift: 0.22 }),
        v('solo', 12.7, 0.04, { lp: 2200, pan: 0.34, drift: 0.3, steps: { 2: 1.4, 3: 2.2, 4: 1.2 } }),
        v('brown', 1, 0.1, { lp: 300, drift: 0.3 }),
      ],
    },
    good: {
      trim: 0.66,
      mix: [0.3, 0.4, 0.05],
      voices: [
        v('brown', 1, 0.16, { lp: 220, drift: 0.2, bus: 'dry' }),
        v('hum', 4, 0.05, { lp: 520, drift: 0.05, bus: 'dry' }),
        v('low', 2, 0.16, { lp: 200, drift: 0.1 }),
        v('sine', 24, 0.014, { drift: 0 }),
        v('organ', 4, 0.07, { lp: 700, steps: { 3: 1.4, 4: 1.8 }, cuts: { 4: 1500 } }),
      ],
    },
    zeno: {
      trim: 0.74,
      mix: [0.34, 0.62, 0.08],
      voices: [
        v('low', 2, 0.26, { lp: 230, drift: 0.1 }),
        v('organ', 4, 0.1, { lp: 900, pan: -0.14, steps: { 1: 1.5, 2: 1.2, 3: 1.7 }, drift: 0.14 }),
        v('strings', 6, 0.08, { lp: 800, pan: 0.28, cuts: { 0: 800, 1: 3800, 2: 2200, 3: 3200 }, drift: 0.24 }),
        v('hiss', 1, 0.03, { lp: 5200, steps: { 1: 3, 2: 1.5 }, drift: 0.6 }),
      ],
    },
    nation: {
      trim: 0.84,
      mix: [0.34, 0.7, 0.1],
      voices: [
        v('low', 2, 0.24, { lp: 240, drift: 0.12 }),
        v('warm', 4, 0.16, { lp: 1500, pan: -0.2, steps: { 1: 1.5, 3: 1.3 }, drift: 0.18 }),
        v('strings', 6, 0.1, { lp: 2000, pan: 0.3, bus: 'wet', steps: { 1: 1.6, 2: 1.2, 3: 1.8 }, cuts: { 1: 3200, 3: 4200 }, drift: 0.26 }),
        v('choir', 8, 0.05, { lp: 2800, pan: -0.3, bus: 'wet', steps: { 1: 2.2, 3: 2.6 }, drift: 0.3 }),
        v('organ', 4, 0.1, { lp: 1100 }),
      ],
    },
    science: {
      trim: 0.8,
      mix: [0.34, 0.66, 0.1],
      voices: [
        v('low', 2, 0.24, { lp: 230, drift: 0.12 }),
        v('organ', 4, 0.12, { lp: 1000, pan: -0.14, steps: { 1: 1.5, 2: 1.2, 3: 1.6 }, drift: 0.14 }),
        v('strings', 6, 0.1, { lp: 1300, pan: 0.26, bus: 'wet', steps: { 1: 1.8, 3: 2.2 }, cuts: { 1: 3400, 3: 4400 }, drift: 0.26 }),
        v('choir', 8, 0.04, { lp: 3000, pan: -0.3, bus: 'wet', steps: { 1: 2.4, 3: 3 }, drift: 0.3 }),
      ],
    },
    scale: {
      trim: 0.86,
      mix: [0.36, 0.72, 0.1],
      voices: [
        v('low', 1, 0.3, { lp: 130, drift: 0.08 }),
        v('low', 2, 0.2, { lp: 220, drift: 0.12 }),
        v('organ', 4, 0.14, { lp: 1100, pan: -0.16, cuts: { 3: 1700, 4: 2400, 5: 2000 }, drift: 0.14 }),
        v('strings', 6, 0.1, { lp: 1600, pan: 0.28, bus: 'wet', steps: { 2: 1.4, 4: 2, 5: 2.6 }, cuts: { 2: 2600, 4: 4200, 5: 5000 }, drift: 0.26 }),
        v('choir', 8, 0.06, { lp: 3200, pan: -0.3, bus: 'wet', steps: { 3: 1.6, 4: 2.4, 5: 3 }, drift: 0.3 }),
        v('sine', 24, 0.0, { bus: 'wet', steps: { 4: 1, 5: 1.6 }, drift: 0 }),
      ],
    },
    white: {
      trim: 0.34,
      mix: [0.2, 0.5, 0.08],
      voices: [v('sine', 24, 0.022, { drift: 0, bus: 'wet' }), v('brown', 1, 0.07, { lp: 150, drift: 0.06, bus: 'dry' })],
    },
    luck: {
      trim: 0.4,
      mix: [0.3, 0.4, 0.04],
      voices: [
        v('sine', 12, 0.035, { drift: 0, bus: 'dry' }),
        v('hum', 4, 0.05, { lp: 400, drift: 0.04, bus: 'dry' }),
        v('brown', 1, 0.07, { lp: 160, drift: 0.08, bus: 'dry' }),
      ],
    },
  };

  // ===========================================================================
  // Transition recipes. Each gets the helpers closed over playTransition's clock:
  //   at(u) → absolute time at progress u · hitAt(sfx, u, opts) · noiseSweep / padSweep · setTotal(seconds)
  // ===========================================================================
  SC.TRANSOUNDS = {
    fade({ noiseSweep, hitAt, setTotal }) {
      noiseSweep('pink', 'bandpass', [[0, 0], [0.5, 0.05], [1, 0]], [[0, 420], [1, 620]], { q: 0.6 });
      hitAt('chime', 0.5, { g: 0.1, rate: 1.5, bus: 'wet' });
      setTotal(3.2);
    },
    plot({ noiseSweep, padSweep, hitAt, H, setTotal }) {
      noiseSweep('hiss', 'highpass', [[0, 0], [0.08, 0.04], [0.9, 0.04], [1, 0]], [[0, 3200], [1, 3200]], { q: 0.5 });
      padSweep('sine', H(24), [[0, 0], [0.4, 0.03], [0.9, 0.03], [1.2, 0]], { pan: 0.3 });
      hitAt('tick', 0.5, { g: 0.6, rate: 1.3 });
      hitAt('sub', 0.96, { g: 0.4 });
      setTotal(5.2);
    },
    burn({ noiseSweep, hitAt, setTotal }) {
      noiseSweep('brown', 'lowpass', [[0, 0], [0.5, 0.5], [1, 0.1], [1.3, 0]], [[0, 120], [0.6, 900], [1.3, 140]], { q: 0.6 });
      noiseSweep('rip', 'bandpass', [[0, 0], [0.15, 0.2], [0.9, 0.26], [1.1, 0]], [[0, 1800], [1, 2600]], { q: 0.5 });
      hitAt('sub', 0.05, { g: 0.5 });
      hitAt('boom', 0.5, { g: 0.6 });
      setTotal(5.5);
    },
    drop({ noiseSweep, hitAt, setTotal }) {
      noiseSweep('pink', 'lowpass', [[0, 0], [0.6, 0.4], [0.72, 0]], [[0, 2600], [0.7, 200]], { q: 0.7 });
      noiseSweep('brown', 'lowpass', [[0, 0], [0.72, 0], [0.76, 0.5], [1.3, 0]], [[0, 400], [1.3, 80]], { q: 0.5 });
      hitAt('thud', 0.72, { g: 1.1, rate: 0.8 });
      hitAt('boom', 0.72, { g: 0.5 });
      setTotal(4.5);
    },
    stretch({ noiseSweep, padSweep, hitAt, H, setTotal }) {
      noiseSweep('pink', 'bandpass', [[0, 0], [0.5, 0.28], [1, 0]], [[0, 300], [0.6, 2400], [1, 5200]], {
        q: 1.2,
        panPts: [[0, 0], [0.5, -0.6], [1, 0.6]],
      });
      padSweep('strings', H(12), [[0, 0], [0.4, 0.1], [1, 0]], { glPts: [[0, 0.5], [1, 2]], lpPts: [[0, 400], [1, 6000]], pan: -0.3 });
      hitAt('shimmer', 0.55, { g: 0.5, bus: 'wet' });
      setTotal(4.7);
    },
    ring({ noiseSweep, padSweep, hitAt, H, setTotal }) {
      noiseSweep('pink', 'bandpass', [[0, 0], [0.5, 0.12], [1, 0]], [[0, 500], [1, 3000]], { q: 0.8 });
      padSweep('sine', H(12), [[0, 0], [0.5, 0.12], [1.1, 0]], { glPts: [[0, 0.5], [1, 1.5]], lpPts: [[0, 800], [1, 4000]] });
      hitAt('chime', 0.5, { g: 0.5, rate: 1.5, bus: 'wet' });
      hitAt('shimmer', 0.62, { g: 0.6, bus: 'wet' });
      setTotal(5.1);
    },
    rewind({ noiseSweep, hitAt, rng, setTotal }) {
      noiseSweep('rip', 'bandpass', [[0, 0], [0.1, 0.3], [0.9, 0.3], [1, 0]], [[0, 1400], [0.5, 2200], [1, 1400]], {
        q: 0.5,
        ratePts: [[0, 0.8], [1, 1.3]],
      });
      for (let i = 0; i < 8; i++) {
        hitAt('click', 0.08 + i * 0.1 + rng() * 0.03, { g: 0.4, rate: 0.7 + rng() * 0.5, pan: rng() - 0.5, bus: 'dry' });
      }
      hitAt('thud', 0.93, { g: 0.5, rate: 1.2 });
      setTotal(4.2);
    },
    zeno({ hitAt, noiseSweep, lerp, setTotal }) {
      const N = 22;
      for (let i = 0; i <= N; i++) {
        const f = i / N;
        hitAt('tick', 0.06 + 0.86 * Math.pow(f, 2.2), { g: 0.35 + 0.5 * f, rate: 1 + f * 1.2, pan: lerp(-0.8, 0.8, f) });
      }
      noiseSweep('pink', 'bandpass', [[0, 0], [0.9, 0.28], [1, 0]], [[0, 300], [1, 4000]], { q: 0.9 });
      hitAt('sub', 0.93, { g: 0.7 });
      hitAt('boom', 0.95, { g: 0.5 });
      setTotal(5.7);
    },
    shockwave({ noiseSweep, hitAt, setTotal }) {
      hitAt('boom', 0.18, { g: 1.2 });
      hitAt('slam', 0.18, { g: 0.9, rate: 0.9 });
      noiseSweep('brown', 'lowpass', [[0, 0], [0.18, 0], [0.24, 0.7], [0.8, 0.3], [1.4, 0]], [[0, 900], [0.5, 200], [1.4, 70]], { q: 0.5 });
      noiseSweep('pink', 'lowpass', [[0, 0], [0.15, 0.1], [0.22, 0]], [[0, 3000], [0.22, 300]], { q: 0.6 });
      setTotal(5.1);
    },
    zoom({ noiseSweep, padSweep, hitAt, H, setTotal }) {
      noiseSweep('pink', 'bandpass', [[0, 0], [0.5, 0.3], [1, 0]], [[0, 160], [0.5, 1200], [1, 180]], { q: 1.0 });
      padSweep('warm', H(4), [[0, 0], [0.4, 0.2], [1.2, 0]], { glPts: [[0, 0.5], [1, 1.41]], lpPts: [[0, 300], [0.8, 3000], [1.2, 800]] });
      hitAt('sub', 0.1, { g: 0.5 });
      hitAt('shimmer', 0.5, { g: 0.4, bus: 'wet' });
      setTotal(5.0);
    },
    overexpose({ noiseSweep, padSweep, hitAt, H, setTotal }) {
      noiseSweep('hiss', 'highpass', [[0, 0], [0.42, 0.2], [0.5, 0.28], [0.62, 0]], [[0, 2500], [0.5, 6000]], { q: 0.5 });
      padSweep('choir', H(8), [[0, 0], [0.4, 0.2], [0.52, 0.24], [0.72, 0]], { lpPts: [[0, 600], [0.45, 7000], [0.72, 1500]] });
      hitAt('chime', 0.47, { g: 0.7, rate: 1.5, bus: 'wet' });
      hitAt('shimmer', 0.5, { g: 0.8, bus: 'wet' });
      hitAt('wave', 0.64, { g: 0.35 });
      setTotal(6.4);
    },
    halftone({ noiseSweep, hitAt, rng, lerp, setTotal }) {
      for (let i = 0; i < 14; i++) {
        hitAt('pop', 0.1 + i * 0.05 + rng() * 0.02, { g: 0.3 + rng() * 0.25, rate: 0.9 + rng() * 0.6, pan: lerp(-0.7, 0.7, i / 13), bus: 'dry' });
      }
      noiseSweep('pink', 'bandpass', [[0, 0], [0.5, 0.12], [1, 0]], [[0, 900], [1, 2400]], { q: 0.7 });
      hitAt('thud', 0.8, { g: 0.4 });
      setTotal(4.4);
    },
  };
})();
