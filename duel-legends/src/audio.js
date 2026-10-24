(function (root) {
  'use strict';

  var AudioContextClass = root.AudioContext || root.webkitAudioContext;
  var context = null;
  var master = null;
  var noiseBuffer = null;
  var unlockPromise = null;
  var resumeOnVisible = false;
  var activeVoices = 0;
  var isMuted = false;
  var MAX_VOICES = 24;

  function setMasterVolume() {
    if (!context || !master) return;
    var now = context.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(isMuted ? 0 : 0.16, now, 0.015);
  }

  function createContext() {
    if (context && context.state !== 'closed') return true;
    if (!AudioContextClass) return false;
    try {
      context = new AudioContextClass();
      master = context.createGain();
      master.gain.value = isMuted ? 0 : 0.16;
      master.connect(context.destination);
      noiseBuffer = null;
      return true;
    } catch (error) {
      context = null;
      master = null;
      return false;
    }
  }

  function unlock() {
    if (!createContext()) return Promise.resolve(false);
    if (context.state === 'running') return Promise.resolve(true);
    if (unlockPromise) return unlockPromise;

    unlockPromise = Promise.resolve()
      .then(function () {
        return context.resume();
      })
      .then(function () {
        unlockPromise = null;
        return context.state === 'running';
      })
      .catch(function () {
        unlockPromise = null;
        return false;
      });
    return unlockPromise;
  }

  function disconnectOnEnd(source, nodes) {
    source.onended = function () {
      activeVoices = Math.max(0, activeVoices - 1);
      nodes.forEach(function (node) {
        try {
          node.disconnect();
        } catch (error) {}
      });
    };
  }

  function tone(frequency, endFrequency, start, duration, volume, type) {
    if (activeVoices >= MAX_VOICES) return;
    var oscillator = context.createOscillator();
    var gain = context.createGain();
    activeVoices += 1;
    oscillator.type = type || 'sine';
    oscillator.frequency.setValueAtTime(Math.max(20, frequency), start);
    if (endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), start + Math.min(0.012, duration / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(master);
    disconnectOnEnd(oscillator, [oscillator, gain]);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  function noise(start, duration, volume, cutoff) {
    if (activeVoices >= MAX_VOICES) return;
    if (!noiseBuffer) {
      var length = Math.ceil(context.sampleRate * 0.6);
      noiseBuffer = context.createBuffer(1, length, context.sampleRate);
      var data = noiseBuffer.getChannelData(0);
      for (var i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    }
    var source = context.createBufferSource();
    var filter = context.createBiquadFilter();
    var gain = context.createGain();
    activeVoices += 1;
    source.buffer = noiseBuffer;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff || 1800, start);
    filter.frequency.exponentialRampToValueAtTime(120, start + duration);
    gain.gain.setValueAtTime(Math.max(0.0001, volume), start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    disconnectOnEnd(source, [source, filter, gain]);
    source.start(start);
    source.stop(start + duration + 0.02);
  }

  var sounds = {
    draw: function (t) {
      tone(520, 920, t, 0.11, 0.16, 'sine');
      tone(1040, 1380, t + 0.055, 0.08, 0.08, 'triangle');
    },
    summon: function (t) {
      tone(110, 330, t, 0.34, 0.22, 'sawtooth');
      tone(220, 440, t + 0.06, 0.3, 0.12, 'triangle');
      tone(440, 660, t + 0.15, 0.25, 0.08, 'sine');
    },
    spell: function (t) {
      tone(330, 990, t, 0.38, 0.12, 'sine');
      tone(495, 1485, t + 0.04, 0.34, 0.08, 'sine');
      tone(660, 1320, t + 0.12, 0.25, 0.06, 'triangle');
    },
    trap: function (t) {
      tone(190, 55, t, 0.3, 0.2, 'sawtooth');
      tone(380, 90, t + 0.025, 0.24, 0.08, 'square');
    },
    attack: function (t) {
      noise(t, 0.2, 0.2, 3200);
      tone(240, 65, t, 0.23, 0.2, 'sawtooth');
    },
    damage: function (t) {
      noise(t, 0.3, 0.24, 1000);
      tone(95, 42, t, 0.32, 0.26, 'square');
    },
    destroy: function (t) {
      noise(t, 0.48, 0.22, 2200);
      tone(180, 35, t, 0.42, 0.18, 'sawtooth');
    },
    phase: function (t) {
      tone(392, 392, t, 0.11, 0.12, 'triangle');
      tone(587, 587, t + 0.1, 0.16, 0.12, 'triangle');
    },
    win: function (t) {
      [523, 659, 784, 1047].forEach(function (frequency, index) {
        tone(frequency, frequency, t + index * 0.12, index === 3 ? 0.5 : 0.18, 0.13, 'triangle');
      });
    },
    click: function (t) {
      tone(720, 520, t, 0.045, 0.1, 'sine');
    }
  };

  function play(name) {
    if (isMuted || !sounds[name]) return Promise.resolve(false);
    if (root.document && root.document.hidden) return Promise.resolve(false);
    return unlock().then(function (ready) {
      if (!ready || isMuted || !context || context.state !== 'running') return false;
      if (root.document && root.document.hidden) return false;
      try {
        sounds[name](context.currentTime + 0.005);
        return true;
      } catch (error) {
        return false;
      }
    }).catch(function () {
      return false;
    });
  }

  function toggle() {
    isMuted = !isMuted;
    setMasterVolume();
    return isMuted;
  }

  if (root.document && root.document.addEventListener) {
    root.document.addEventListener('visibilitychange', function () {
      if (!context || context.state === 'closed') return;
      if (root.document.hidden) {
        resumeOnVisible = context.state === 'running';
        if (resumeOnVisible) context.suspend().catch(function () {});
      } else if (resumeOnVisible) {
        resumeOnVisible = false;
        context.resume().catch(function () {});
      }
    });
  }

  var api = {
    unlock: unlock,
    play: play,
    toggle: toggle
  };
  Object.defineProperty(api, 'muted', {
    enumerable: true,
    get: function () { return isMuted; }
  });

  root.DuelAudio = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
