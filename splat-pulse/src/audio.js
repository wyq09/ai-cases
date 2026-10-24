(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.PulseAudio = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const clamp01 = value => Math.max(0, Math.min(1, value));
  const neutralFeatures = () => ({
    bass: 0, mid: 0, high: 0, level: 0, flux: 0,
    beat: false, bpm: null, beatCount: 0
  });

  function bandRange(length, minHz, maxHz, binHz) {
    const start = Math.max(1, Math.ceil(minHz / binHz));
    const end = maxHz === Infinity
      ? length - 1
      : Math.min(length - 1, Math.ceil(maxHz / binHz) - 1);
    return [start, end];
  }

  function bandAverage(freq, minHz, maxHz, binHz) {
    if (!freq || !freq.length) return 0;
    const [start, end] = bandRange(freq.length, minHz, maxHz, binHz);
    if (end < start) return 0;
    let sum = 0;
    for (let i = start; i <= end; i++) sum += freq[i] / 255;
    return clamp01(sum / (end - start + 1));
  }

  function median(values) {
    const sorted = values.slice().sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  class BeatDetector {
    constructor(sampleRate = 44100, fftSize = 2048) {
      this.sampleRate = sampleRate;
      this.fftSize = fftSize;
      this.binHz = sampleRate / fftSize;
      this.features = neutralFeatures();
      this._bass = this._mid = this._high = this._level = this._flux = 0;
      this._prevFreq = this._prevBass = null;
      this._history = [];
      this._intervals = [];
      this._lastBeatTime = this._lastTime = this._bpm = null;
      this._beatCount = 0;
    }

    _result(beat) {
      this.features = {
        bass: clamp01(this._bass), mid: clamp01(this._mid),
        high: clamp01(this._high), level: clamp01(this._level),
        flux: clamp01(this._flux), beat, bpm: this._bpm, beatCount: this._beatCount
      };
      return this.features;
    }

    _addInterval(interval) {
      if (!Number.isFinite(interval) || interval < 0.2 || interval > 2) {
        this._intervals = []; this._bpm = null; return;
      }
      let normalized = interval;
      while (60 / normalized > 180 && normalized < 1) normalized *= 2;
      while (60 / normalized < 70 && normalized > 0.25) normalized /= 2;
      const tempo = 60 / normalized;
      if (tempo < 70 || tempo > 180) {
        this._intervals = []; this._bpm = null; return;
      }
      this._intervals.push(normalized);
      if (this._intervals.length > 6) this._intervals.shift();
      if (this._intervals.length < 3) { this._bpm = null; return; }
      const center = median(this._intervals);
      const inliers = this._intervals.filter(value => Math.abs(value - center) <= center * 0.1);
      if (inliers.length < 3 || inliers.length < this._intervals.length - 1) {
        this._bpm = null; return;
      }
      this._bpm = Math.round((60 / median(inliers)) * 10) / 10;
    }

    update(freq, time, playing = true) {
      const now = Number.isFinite(time) ? time : 0;
      const dt = this._lastTime === null ? 1 / 60 : Math.max(0, Math.min(0.25, now - this._lastTime));
      this._lastTime = now;
      if (!playing) {
        const decay = Math.exp(-dt * 7);
        for (const key of ['_bass', '_mid', '_high', '_level', '_flux']) this[key] *= decay;
        this._bpm = null;
        this._intervals = []; this._history = [];
        this._prevFreq = this._prevBass = this._lastBeatTime = null;
        return this._result(false);
      }
      const bass = bandAverage(freq, 20, 160, this.binHz);
      const mid = bandAverage(freq, 160, 2000, this.binHz);
      const high = bandAverage(freq, 2000, Infinity, this.binHz);
      const level = bandAverage(freq, 20, Infinity, this.binHz);
      let flux = 0, lowFlux = 0;
      if (freq && this._prevFreq && freq.length === this._prevFreq.length) {
        const [lowStart, lowEnd] = bandRange(freq.length, 20, 160, this.binHz);
        let fluxSum = 0, lowSum = 0;
        for (let i = 1; i < freq.length; i++) {
          const difference = Math.max(0, (freq[i] - this._prevFreq[i]) / 255);
          fluxSum += difference;
          if (i >= lowStart && i <= lowEnd) lowSum += difference;
        }
        flux = fluxSum / Math.max(1, freq.length - 1);
        lowFlux = lowEnd >= lowStart ? lowSum / (lowEnd - lowStart + 1) : 0;
      }
      const bassRise = this._prevBass === null || !freq ? 0 : Math.max(0, bass - this._prevBass);
      const onset = bassRise + lowFlux * 0.5;
      while (this._history.length && now - this._history[0].time > 1.25) this._history.shift();
      let mean = 0;
      for (const item of this._history) mean += item.value;
      mean = this._history.length ? mean / this._history.length : 0;
      let variance = 0;
      for (const item of this._history) variance += (item.value - mean) ** 2;
      const deviation = this._history.length ? Math.sqrt(variance / this._history.length) : 0;
      const threshold = this._history.length >= 8
        ? Math.max(0.055, mean + deviation * 2.4, mean * 4.5) : 0.055;
      let beat = false;
      if (
        this._history.length >= 6 && freq && bass > 0.025 && bassRise > 0.025 &&
        bassRise > lowFlux * 0.35 && onset > threshold &&
        (this._lastBeatTime === null || now - this._lastBeatTime >= 0.2)
      ) {
        beat = true; this._beatCount++;
        if (this._lastBeatTime !== null) this._addInterval(now - this._lastBeatTime);
        this._lastBeatTime = now;
      }
      this._history.push({ time: now, value: onset });
      if (this._lastBeatTime !== null && now - this._lastBeatTime > 2.6) {
        this._bpm = null; this._intervals = [];
      }
      this._prevFreq = freq ? new Uint8Array(freq) : null;
      this._prevBass = freq ? bass : null;
      this._bass = bass; this._mid = mid; this._high = high;
      this._level = level; this._flux = flux;
      return this._result(beat);
    }
  }

  function createDemoBuffer(ctx, seconds = 16, bpm = 120, sampleRate = ctx.sampleRate) {
    if (!ctx || typeof ctx.createBuffer !== 'function') {
      throw new Error('当前音频环境无法创建内置演示音轨。');
    }
    if (![seconds, bpm, sampleRate].every(Number.isFinite) || seconds <= 0 || bpm <= 0 || sampleRate <= 0) {
      throw new Error('内置演示音轨的参数无效。');
    }
    const length = Math.max(1, Math.floor(seconds * sampleRate));
    const buffer = ctx.createBuffer(2, length, sampleRate);
    const left = buffer.getChannelData(0), right = buffer.getChannelData(1);
    const beatDuration = 60 / bpm, barDuration = beatDuration * 4;
    const roots = [55, 65.406, 73.416, 48.999], chord = [1, 1.189207, 1.498307];
    let seed = 0x51f15e;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296 * 2 - 1;
    };
    function add(start, duration, amplitude, pan, voice) {
      if (start >= seconds) return;
      const first = Math.max(0, Math.floor(start * sampleRate));
      const end = Math.min(length, first + Math.ceil(duration * sampleRate));
      const gainL = pan < 0 ? 1 : 1 - pan, gainR = pan > 0 ? 1 : 1 + pan;
      for (let i = first; i < end; i++) {
        const sample = voice((i - first) / sampleRate) * amplitude;
        left[i] += sample * gainL;
        right[i] += sample * gainR;
      }
    }
    function kick(time, amplitude = 0.7) {
      add(time, 0.46, amplitude, 0, t => {
        const phase = 2 * Math.PI * (47 * t + 92 * (1 - Math.exp(-t * 28)) / 28);
        return Math.sin(phase) * Math.exp(-t * 9) * Math.min(1, t / 0.003);
      });
    }
    for (let beat = 0; beat * beatDuration < seconds; beat++) {
      const time = beat * beatDuration;
      const bar = Math.floor(beat / 4);
      const rootNote = roots[bar % roots.length];
      kick(time);
      if (beat % 4 === 1 || beat % 4 === 3) {
        let previous = 0;
        add(time, 0.2, 0.24, 0.05, t => {
          const noise = random();
          const highpass = noise - previous;
          previous = noise;
          return (highpass * 0.8 + Math.sin(2 * Math.PI * 185 * t) * 0.3) * Math.exp(-t * 19);
        });
      }
      const bassNote = rootNote * (beat % 4 === 2 ? 1.5 : 1);
      add(time, beatDuration * 0.92, 0.16, 0, t =>
        (Math.sin(2 * Math.PI * bassNote * t) + Math.sin(2 * Math.PI * bassNote * 2 * t) * 0.16) *
        Math.min(1, t / 0.012) * Math.min(1, (beatDuration * 0.92 - t) / 0.07) * Math.exp(-t * 1.2)
      );
      if (beat % 4 === 0 && bar % 4 === 2) kick(time + beatDuration * 3.75, 0.48);
    }
    for (let step = 0; step * beatDuration / 2 < seconds; step++) {
      const time = step * beatDuration / 2;
      const bar = Math.floor(time / barDuration);
      const rootNote = roots[bar % roots.length];
      let previous = 0;
      add(time, step % 2 ? 0.09 : 0.055, step % 2 ? 0.075 : 0.055, step % 2 ? 0.25 : -0.2, t => {
        const noise = random();
        const highpass = noise - previous;
        previous = noise;
        return highpass * Math.exp(-t * (step % 2 ? 38 : 70));
      });
      const note = rootNote * 4 * chord[(step + bar) % chord.length] * (step % 8 >= 4 ? 2 : 1);
      const duration = Math.min(0.28, beatDuration * 0.7);
      add(time, duration, 0.105, step % 2 ? 0.35 : -0.35, t =>
        (Math.sin(2 * Math.PI * note * t) + Math.sin(2 * Math.PI * note * 2.01 * t) * 0.28) *
        Math.min(1, t / 0.006) * Math.min(1, (duration - t) / 0.035) * Math.exp(-t * 13)
      );
    }
    for (let bar = 0; bar * barDuration < seconds; bar++) {
      const rootNote = roots[bar % roots.length] * 4;
      for (let note = 0; note < chord.length; note++) {
        const frequency = rootNote * chord[note];
        add(bar * barDuration, barDuration * 1.04, 0.035, (note - 1) * 0.65, t =>
          (Math.sin(2 * Math.PI * frequency * t + note * 0.7) + Math.sin(2 * Math.PI * frequency * 2 * t) * 0.2) *
          Math.min(1, t / 0.3) * Math.min(1, (barDuration * 1.04 - t) / 0.45)
        );
      }
    }
    let peak = 0;
    const fade = Math.min(Math.floor(sampleRate * 0.02), Math.floor(length / 2));
    for (let i = 0; i < length; i++) {
      const envelope = fade ? Math.max(0, Math.min(1, i / fade, (length - 1 - i) / fade)) : 1;
      left[i] *= envelope;
      right[i] *= envelope;
      peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
    }
    const scale = peak > 0.9 ? 0.9 / peak : 1;
    for (let i = 0; i < length; i++) {
      left[i] *= scale;
      right[i] *= scale;
    }
    return buffer;
  }

  class AudioEngine {
    constructor({ onChange } = {}) {
      this.onChange = typeof onChange === 'function' ? onChange : null;
      this.context = this.analyser = this.element = null;
      this.duration = 0; this.playing = false;
      this.trackName = ''; this.kind = null;
      this.volume = 1;
      this.features = neutralFeatures();
      this.spectrum = new Uint8Array(1024);
      this._gain = this._buffer = this._demoBuffer = this._source = this._detector = null;
      this._offset = this._startedAt = this._token = 0;
    }

    // 只读 getter；demo 返回循环内位置，file 最多返回 duration。
    get currentTime() {
      if (!Number.isFinite(this.duration) || this.duration <= 0) return 0;
      let position = this._offset;
      if (this.playing && this.context) {
        position += Math.max(0, this.context.currentTime - this._startedAt);
      }
      if (this.kind === 'demo' && position >= this.duration) position %= this.duration;
      return Math.max(0, Math.min(this.duration, position));
    }

    _notify() { if (this.onChange) this.onChange(this.getState()); }

    async init() {
      if (this.context) return this;
      const AudioContextClass = root.AudioContext || root.webkitAudioContext;
      if (!AudioContextClass) throw new Error('当前浏览器不支持 Web Audio，无法播放音频。');
      this.context = new AudioContextClass();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.75;
      this._gain = this.context.createGain();
      this._gain.gain.value = this.volume;
      this.analyser.connect(this._gain);
      this._gain.connect(this.context.destination);
      this.spectrum = new Uint8Array(this.analyser.frequencyBinCount);
      this._detector = new BeatDetector(this.context.sampleRate, this.analyser.fftSize);
      return this;
    }

    _resetDetector() {
      if (this.context) this._detector = new BeatDetector(this.context.sampleRate, 2048);
      this.features = neutralFeatures(); this.spectrum.fill(0);
    }

    _stopSource() {
      this._token++;
      if (!this._source) return;
      this._source.onended = null;
      try { this._source.stop(); } catch (_) { /* 已结束的 source 无需再次停止。 */ }
      try { this._source.disconnect(); } catch (_) { /* 已断开的节点无需处理。 */ }
      this._source = null;
    }

    _replaceTrack(buffer, kind, trackName) {
      this._stopSource(); this.playing = false;
      this._buffer = buffer; this.kind = kind; this.trackName = trackName;
      this.duration = Number.isFinite(buffer.duration) ? buffer.duration : buffer.length / buffer.sampleRate;
      this._offset = this._startedAt = 0;
      this._resetDetector();
      this._notify();
    }

    async _decode(data) {
      return new Promise((resolve, reject) => {
        try {
          const result = this.context.decodeAudioData(data, resolve, reject);
          if (result && typeof result.then === 'function') result.then(resolve, reject);
        } catch (error) {
          reject(error);
        }
      });
    }

    async loadFile(file) {
      await this.init();
      if (!file) throw new Error('没有可读取的音频文件，请重新选择。');
      const name = String(file.name || '未命名音轨');
      const type = String(file.type || '').toLowerCase();
      const extensionOK = /\.(mp3|wav|m4a|aac|ogg|oga|flac|opus|webm)$/i.test(name);
      if (!type.startsWith('audio/') && !extensionOK) {
        throw new Error('请选择 MP3、WAV、M4A、AAC、OGG、FLAC 等常见音频文件。');
      }
      if (typeof file.arrayBuffer !== 'function') {
        throw new Error('当前浏览器无法读取该文件，请更换浏览器后重试。');
      }
      let buffer;
      try {
        const data = await file.arrayBuffer();
        buffer = await this._decode(data);
        if (!buffer || !buffer.length || !Number.isFinite(buffer.duration) || buffer.duration <= 0) {
          throw new Error('invalid decoded audio');
        }
      } catch (_) {
        throw new Error('无法解码这个音频文件。请确认文件未损坏，并使用常见的 MP3、WAV、M4A、AAC、OGG 或 FLAC 格式。');
      }
      const cleanName = name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 180) || '未命名音轨';
      this._replaceTrack(buffer, 'file', cleanName);
      return this;
    }

    async loadDemo() {
      await this.init();
      if (!this._demoBuffer) {
        this._demoBuffer = createDemoBuffer(this.context, 16, 120, this.context.sampleRate);
      }
      this._replaceTrack(this._demoBuffer, 'demo', 'Neon Afterhours · Built-in loop');
      return this;
    }

    _startSource(offset) {
      const source = this.context.createBufferSource();
      source.buffer = this._buffer;
      source.loop = this.kind === 'demo';
      source.connect(this.analyser);
      this._source = source;
      this._offset = offset;
      this._startedAt = this.context.currentTime;
      const token = ++this._token;
      source.onended = () => {
        if (token !== this._token || this._source !== source || !this.playing || this.kind !== 'file') return;
        this._source = null;
        this.playing = false;
        this._offset = this.duration;
        this._notify();
      };
      source.start(0, offset);
    }

    async play() {
      await this.init();
      if (!this.kind) await this.loadDemo();
      if (this.context.state === 'suspended' && typeof this.context.resume === 'function') {
        await this.context.resume();
      }
      if (this.playing) return;
      if (!this._buffer) throw new Error('尚未加载可播放的音轨。');
      if (this._offset >= this.duration) this._offset = 0;
      const offset = Math.max(0, Math.min(this._offset, Math.max(0, this.duration - 0.001)));
      this.playing = true;
      try {
        this._startSource(offset);
      } catch (error) {
        this.playing = false;
        this._source = null;
        throw new Error('音频播放启动失败，请再次点击播放。');
      }
      this._notify();
    }

    pause() {
      if (!this.playing) return;
      const position = this.currentTime;
      this._stopSource();
      this._offset = position;
      this.playing = false;
      this._notify();
    }

    seek(seconds) {
      if (!Number.isFinite(seconds) || !Number.isFinite(this.duration) || this.duration <= 0) {
        return this.currentTime;
      }
      const target = Math.max(0, Math.min(seconds, Math.max(0, this.duration - 0.001)));
      const wasPlaying = this.playing;
      if (wasPlaying) this._stopSource();
      this._offset = target;
      if (wasPlaying) this._startSource(target);
      this._notify();
      return target;
    }

    setVolume(value) {
      if (!Number.isFinite(value)) return this.volume;
      this.volume = clamp01(value);
      if (this._gain) this._gain.gain.value = this.volume;
      this._notify();
      return this.volume;
    }

    update(time) {
      if (!this.analyser || !this._detector) {
        this.features = neutralFeatures();
        return this.features;
      }
      const now = Number.isFinite(time)
        ? time
        : (root.performance && typeof root.performance.now === 'function' ? root.performance.now() / 1000 : Date.now() / 1000);
      this.analyser.getByteFrequencyData(this.spectrum);
      this.features = this._detector.update(this.spectrum, now, this.playing);
      return this.features;
    }

    getState() {
      return {
        playing: this.playing, kind: this.kind, trackName: this.trackName,
        duration: this.duration, currentTime: this.currentTime,
        volume: this.volume, bpm: this.features.bpm, beatCount: this.features.beatCount
      };
    }
  }

  return { BeatDetector, createDemoBuffer, AudioEngine };
});
