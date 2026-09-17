/* 跳一跳：仅 WebAudio，无背景音乐、网络资源或存档访问。 */
(function () {
  'use strict';

  var JJ = (window.JJ = window.JJ || {});
  var context = null, master = null, resuming = null;
  var muted = false, charge = null, noise = null;
  var voices = new Set();
  var names = ['jump', 'land', 'fall', 'bonus'];
  var overrides = Object.create(null);

  function hidden() { return document.hidden === true; }
  function ready() {
    return context && context.state === 'running' && !muted && !hidden();
  }
  function disconnect(node) {
    try { node.disconnect(); } catch (_) { /* Already disconnected. */ }
  }
  function dispose(voice) {
    if (voice.disposed) return;
    voice.disposed = true;
    voice.nodes.forEach(disconnect);
    voices.delete(voice);
    if (charge === voice) charge = null;
  }
  function voice() {
    var gain = context.createGain();
    gain.connect(master);
    var v = { gain: gain, nodes: [gain], sources: [], ended: 0, disposed: false };
    voices.add(v);
    return v;
  }
  function source(v, node) {
    v.nodes.push(node);
    v.sources.push(node);
    node.onended = function () {
      disconnect(node);
      v.ended++;
      if (v.ended === v.sources.length) dispose(v);
    };
    return node;
  }
  function stop(v, immediate) {
    if (!v || v.disposed) return;
    var now = context.currentTime;
    var end = now + (immediate ? 0 : 0.035);
    var gain = v.gain.gain;
    if (typeof gain.cancelAndHoldAtTime === 'function') {
      gain.cancelAndHoldAtTime(now);
    } else {
      var current = gain.value;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(current, now);
    }
    gain.linearRampToValueAtTime(0, end);
    v.sources.forEach(function (s) {
      try { s.stop(end); } catch (_) { /* A source may have ended already. */ }
    });
    // Disconnect immediately when hidden/muted, even if the audio clock is suspended.
    if (immediate) dispose(v);
  }
  function stopAll() {
    charge = null;
    voices.forEach(function (v) { stop(v, true); });
  }
  function syncMute() {
    if (!master) return;
    master.gain.setValueAtTime(muted || hidden() ? 0 : 0.65, context.currentTime);
    if (muted || hidden()) stopAll();
  }

  function unlock() {
    if (!context) {
      var AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return Promise.resolve(false);
      try {
        context = new AudioContext();
        master = context.createGain();
        master.connect(context.destination);
        syncMute();
        context.addEventListener('statechange', function () {
          if (context.state !== 'running') stopAll();
        });
      } catch (_) {
        if (context) {
          try { var closing = context.close(); if (closing) closing.catch(function () {}); } catch (_) {}
        }
        context = null;
        master = null;
        return Promise.resolve(false);
      }
    }
    names.forEach(function (name) { decode(overrides[name]); });
    if (context.state === 'running') return Promise.resolve(true);
    if (context.state === 'closed' || hidden()) return Promise.resolve(false);
    if (resuming) return resuming;
    try {
      resuming = Promise.resolve(context.resume()).then(function () {
        resuming = null;
        syncMute();
        return context.state === 'running';
      }, function () { resuming = null; return false; });
      return resuming;
    } catch (_) { return Promise.resolve(false); }
  }

  function envelope(v, start, duration, level, attack) {
    var gain = v.gain.gain;
    gain.setValueAtTime(0, start);
    gain.linearRampToValueAtTime(level, start + attack);
    gain.exponentialRampToValueAtTime(0.0001, start + duration);
    gain.setValueAtTime(0, start + duration + 0.01);
  }
  function tone(frequency, endFrequency, duration, level, type, delay) {
    var v = voice(), t = context.currentTime + (delay || 0);
    var osc = source(v, context.createOscillator());
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(frequency, t);
    if (endFrequency) osc.frequency.exponentialRampToValueAtTime(endFrequency, t + duration);
    osc.connect(v.gain);
    envelope(v, t, duration, level, 0.008);
    osc.start(t);
    osc.stop(t + duration + 0.015);
  }

  function chargeStart() {
    if (!ready() || charge) return;
    var v = voice(), t = context.currentTime;
    charge = v;
    var osc = source(v, context.createOscillator());
    var wobble = source(v, context.createOscillator());
    var depth = context.createGain();
    v.nodes.push(depth);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(125, t);
    osc.frequency.exponentialRampToValueAtTime(510, t + 3.8);
    wobble.frequency.setValueAtTime(5, t);
    wobble.frequency.linearRampToValueAtTime(11, t + 3.8);
    depth.gain.setValueAtTime(7, t);
    depth.gain.linearRampToValueAtTime(18, t + 3.8);
    wobble.connect(depth);
    depth.connect(osc.frequency);
    osc.connect(v.gain);
    v.gain.gain.setValueAtTime(0, t);
    v.gain.gain.linearRampToValueAtTime(0.105, t + 0.08);
    wobble.start(t);
    osc.start(t);
  }
  function chargeStop() {
    var v = charge;
    charge = null;
    stop(v, !ready());
  }

  function custom(name) {
    var entry = overrides[name];
    if (!entry || !entry.buffer) return false;
    var v = voice(), t = context.currentTime;
    var s = source(v, context.createBufferSource());
    s.buffer = entry.buffer;
    s.connect(v.gain);
    // Imported effects remain short one-shots, never looping music.
    var duration = Math.min(4, s.buffer.duration);
    if (duration <= 0.01) { dispose(v); return false; }
    v.gain.gain.setValueAtTime(0, t);
    v.gain.gain.linearRampToValueAtTime(0.7, t + Math.min(0.005, duration / 4));
    v.gain.gain.setValueAtTime(0.7, t + duration - Math.min(0.02, duration / 4));
    v.gain.gain.linearRampToValueAtTime(0, t + duration);
    s.start(t, 0, duration);
    s.stop(t + duration + 0.01);
    return true;
  }
  function jump() {
    chargeStop();
    if (!ready() || custom('jump')) return;
    if (!noise) {
      noise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.2), context.sampleRate);
      var samples = noise.getChannelData(0);
      for (var i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    }
    var v = voice(), t = context.currentTime;
    var s = source(v, context.createBufferSource());
    var filter = context.createBiquadFilter();
    v.nodes.push(filter);
    s.buffer = noise;
    filter.type = 'bandpass';
    filter.Q.value = 0.7;
    filter.frequency.setValueAtTime(1500, t);
    filter.frequency.exponentialRampToValueAtTime(280, t + 0.17);
    s.connect(filter);
    filter.connect(v.gain);
    envelope(v, t, 0.18, 0.32, 0.018);
    s.start(t);
    s.stop(t + 0.2);
  }
  function land(combo) {
    if (!ready() || custom('land')) return;
    var count = typeof combo === 'number' && isFinite(combo) ? Math.max(0, Math.floor(combo)) : 0;
    if (!count) { tone(185, 95, 0.13, 0.23, 'sine'); return; }
    var scale = [0, 2, 4, 7, 9];
    var step = Math.min(count - 1, 14);
    var note = 392 * Math.pow(2, (scale[step % 5] + 12 * Math.floor(step / 5)) / 12);
    tone(note, null, 0.24, 0.18, 'sine');
    tone(note * 2, null, 0.12, 0.035, 'sine');
  }
  function fall() {
    chargeStop();
    if (!ready() || custom('fall')) return;
    tone(240, 65, 0.52, 0.18, 'triangle');
    tone(120, 42, 0.6, 0.12, 'sine', 0.04);
  }
  function bonus() {
    if (!ready() || custom('bonus')) return;
    [523.25, 659.25, 783.99, 1046.5].forEach(function (note, i) {
      tone(note, null, 0.65, 0.09, 'sine', i * 0.025);
      tone(note * 2, null, 0.16, 0.017, 'sine', i * 0.025);
    });
  }

  function dataBytes(url) {
    var comma = url.indexOf(',');
    if (comma < 0) throw new Error('Invalid data URL');
    var header = url.slice(0, comma), body = url.slice(comma + 1);
    var binary = /;base64$/i.test(header) ? window.atob(decodeURIComponent(body)) : null;
    var bytes = [];
    if (binary !== null) {
      for (var i = 0; i < binary.length; i++) bytes.push(binary.charCodeAt(i));
    } else {
      for (var j = 0; j < body.length; j++) {
        if (body[j] === '%') {
          var hex = body.slice(j + 1, j + 3);
          if (!/^[0-9a-f]{2}$/i.test(hex)) throw new Error('Invalid escape');
          bytes.push(parseInt(hex, 16));
          j += 2;
        } else {
          if (body.charCodeAt(j) > 255) throw new Error('Invalid byte');
          bytes.push(body.charCodeAt(j));
        }
      }
    }
    return new Uint8Array(bytes).buffer;
  }
  function decode(entry) {
    if (!entry || entry.started || !context || context.state === 'closed') return;
    entry.started = true;
    try {
      // Callback form also supports older WebKit. Handle its optional Promise too.
      var result = context.decodeAudioData(dataBytes(entry.url), function (buffer) {
        entry.buffer = buffer;
      }, function () { entry.buffer = null; });
      if (result && typeof result.catch === 'function') result.catch(function () {});
    } catch (_) { entry.buffer = null; }
  }
  function applyOverrides(map) {
    var next = Object.create(null);
    names.forEach(function (name) {
      var url = map && typeof map === 'object' && Object.prototype.hasOwnProperty.call(map, name) ? map[name] : null;
      if (typeof url !== 'string' || !/^data:/i.test(url) || url.length > 450000) return;
      // A replaced entry cannot overwrite a newer decode when it finishes late.
      next[name] = overrides[name] && overrides[name].url === url ? overrides[name] : { url: url, buffer: null, started: false };
      decode(next[name]);
    });
    overrides = next;
  }

  document.addEventListener('visibilitychange', function () {
    if (hidden()) stopAll();
    syncMute();
  });
  JJ.AUDIO = {
    unlock: unlock,
    setMuted: function (value) { muted = !!value; if (muted) stopAll(); syncMute(); },
    chargeStart: chargeStart,
    chargeStop: chargeStop,
    jump: jump,
    land: land,
    fall: fall,
    bonus: bonus,
    applyOverrides: applyOverrides
  };
})();
