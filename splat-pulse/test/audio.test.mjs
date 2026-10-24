import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { BeatDetector, createDemoBuffer, AudioEngine } = require('../src/audio.js');

function fillBand(freq, detector, minHz, maxHz, value) {
  freq.fill(0);
  const start = Math.max(1, Math.ceil(minHz / detector.binHz));
  const end = Math.min(freq.length - 1, Math.ceil(maxHz / detector.binHz) - 1);
  freq.fill(value, start, end + 1);
}

function impulseTempo(rawBpm, seconds = 12, fps = 60) {
  const detector = new BeatDetector();
  const freq = new Uint8Array(1024);
  const interval = 60 / rawBpm;
  let nextImpulse = 0.25;
  let result;
  for (let frame = 0; frame < seconds * fps; frame++) {
    const time = frame / fps;
    if (time + 0.000001 >= nextImpulse) {
      fillBand(freq, detector, 20, 160, 240);
      nextImpulse += interval;
    } else {
      freq.fill(0);
    }
    result = detector.update(freq, time, true);
  }
  return result;
}

test('IIFE 无需 DOM、matchMedia 或 WebAudio，并提供浏览器全局命名空间', () => {
  const source = readFileSync(new URL('../src/audio.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox);
  assert.equal(typeof sandbox.window.PulseAudio.BeatDetector, 'function');
  assert.equal(typeof sandbox.window.PulseAudio.createDemoBuffer, 'function');
  assert.equal(typeof sandbox.window.PulseAudio.AudioEngine, 'function');
});

test('频带按 sampleRate / fftSize 的真实 bin 频率划分', () => {
  const detector = new BeatDetector(16000, 1000); // 每 bin 16 Hz
  const freq = new Uint8Array(500);
  freq[9] = 255; // 144 Hz：bass
  let features = detector.update(freq, 0);
  assert.ok(features.bass > 0);
  assert.equal(features.mid, 0);
  assert.equal(features.high, 0);
  assert.ok(features.level > 0);

  freq.fill(0);
  freq[10] = 255; // 160 Hz：mid，不与 bass 重叠
  features = detector.update(freq, 1 / 60);
  assert.equal(features.bass, 0);
  assert.ok(features.mid > 0);
  assert.equal(features.high, 0);

  freq.fill(0);
  freq[125] = 255; // 2000 Hz：high
  features = detector.update(freq, 2 / 60);
  assert.equal(features.bass, 0);
  assert.equal(features.mid, 0);
  assert.ok(features.high > 0);
  for (const key of ['bass', 'mid', 'high', 'level', 'flux']) {
    assert.ok(features[key] >= 0 && features[key] <= 1, key);
  }
});

test('全频满能量归一化到 0..1，DC 不计入可听频带', () => {
  const detector = new BeatDetector();
  const freq = new Uint8Array(1024).fill(255);
  const features = detector.update(freq, 0);
  assert.equal(features.bass, 1);
  assert.equal(features.mid, 1);
  assert.equal(features.high, 1);
  assert.equal(features.level, 1);
  freq.fill(0);
  freq[0] = 255;
  const dc = detector.update(freq, 1 / 60);
  assert.equal(dc.bass, 0);
  assert.equal(dc.level, 0);
});

test('静音不会制造 onset、beatCount 或 BPM', () => {
  const detector = new BeatDetector();
  const silence = new Uint8Array(1024);
  for (let frame = 0; frame < 600; frame++) {
    const features = detector.update(silence, frame / 60);
    assert.equal(features.beat, false);
    assert.equal(features.bpm, null);
  }
  assert.equal(detector.features.beatCount, 0);
  assert.equal(detector.features.level, 0);
});

test('持续低频能量只反映能量，不会被逐帧误判为节拍', () => {
  const detector = new BeatDetector();
  const freq = new Uint8Array(1024);
  fillBand(freq, detector, 20, 160, 220);
  for (let frame = 0; frame < 300; frame++) {
    const features = detector.update(freq, frame / 60);
    assert.equal(features.beat, false);
    assert.ok(features.bass > 0.85);
  }
  assert.equal(detector.features.beatCount, 0);
  assert.equal(detector.features.bpm, null);
});

test('自适应 onset 阈值与约 0.2 秒 refractory 同时生效', () => {
  const detector = new BeatDetector();
  const freq = new Uint8Array(1024);
  for (let frame = 0; frame < 60; frame++) detector.update(freq, frame / 60);
  fillBand(freq, detector, 20, 160, 255);
  assert.equal(detector.update(freq, 1).beat, true);
  freq.fill(0);
  detector.update(freq, 1.05);
  fillBand(freq, detector, 20, 160, 255);
  assert.equal(detector.update(freq, 1.1).beat, false);
  freq.fill(0);
  detector.update(freq, 1.2);
  fillBand(freq, detector, 20, 160, 255);
  assert.equal(detector.update(freq, 1.25).beat, true);
  assert.equal(detector.features.beatCount, 2);
});

test('平稳随机噪声不会产生大量误拍或可信 BPM', () => {
  const detector = new BeatDetector();
  const freq = new Uint8Array(1024);
  let seed = 123456789;
  for (let frame = 0; frame < 900; frame++) {
    for (let i = 1; i < freq.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      freq[i] = seed >>> 24;
    }
    const features = detector.update(freq, frame / 60);
    assert.equal(features.bpm, null);
  }
  assert.ok(detector.features.beatCount <= 3, `noise beats=${detector.features.beatCount}`);
});

test('暂停时节拍与 BPM 停止累计，已有能量逐渐衰减', () => {
  const detector = new BeatDetector();
  const freq = new Uint8Array(1024).fill(200);
  detector.update(freq, 0);
  const before = detector.features.level;
  const paused = detector.update(freq, 0.1, false);
  assert.equal(paused.beat, false);
  assert.equal(paused.bpm, null);
  assert.ok(paused.level < before && paused.level > 0);
  const count = paused.beatCount;
  for (let frame = 1; frame <= 30; frame++) {
    const features = detector.update(freq, 0.1 + frame / 60, false);
    assert.equal(features.beat, false);
    assert.equal(features.bpm, null);
    assert.equal(features.beatCount, count);
  }
  assert.ok(detector.features.level < paused.level);
});

test('120 BPM 合成低频冲激需至少三个稳定间隔才报告速度', () => {
  const detector = new BeatDetector();
  const freq = new Uint8Array(1024);
  let latest;
  for (let frame = 0; frame <= 120; frame++) {
    const time = frame / 60;
    if (frame === 15 || frame === 45 || frame === 75) fillBand(freq, detector, 20, 160, 255);
    else freq.fill(0);
    latest = detector.update(freq, time);
  }
  assert.equal(latest.beatCount, 3);
  assert.equal(latest.bpm, null);
  for (let frame = 121; frame <= 135; frame++) {
    const time = frame / 60;
    if (frame === 135) fillBand(freq, detector, 20, 160, 255);
    else freq.fill(0);
    latest = detector.update(freq, time);
  }
  assert.equal(latest.beatCount, 4);
  assert.ok(Math.abs(latest.bpm - 120) < 0.2, `bpm=${latest.bpm}`);
});

test('稳定冲激支持 75、90、120、150 BPM', () => {
  for (const bpm of [75, 90, 120, 150]) {
    const features = impulseTempo(bpm);
    assert.ok(features.bpm !== null, `raw bpm=${bpm}`);
    assert.ok(Math.abs(features.bpm - bpm) < 0.6, `raw=${bpm}, detected=${features.bpm}`);
    assert.ok(features.beatCount >= Math.floor(60 / bpm * 10));
  }
});

test('超范围冲激通过 half/double tempo 折叠到可信范围', () => {
  for (const rawBpm of [60, 240]) {
    const features = impulseTempo(rawBpm, rawBpm === 240 ? 10 : 16);
    assert.ok(features.bpm !== null, `raw bpm=${rawBpm}`);
    assert.ok(Math.abs(features.bpm - 120) < 0.6, `raw=${rawBpm}, detected=${features.bpm}`);
    assert.ok(features.bpm >= 70 && features.bpm <= 180);
  }
});

test('不规则冲激保留 onset，但不伪造稳定 BPM', () => {
  const detector = new BeatDetector();
  const freq = new Uint8Array(1024);
  const gaps = [0.31, 0.83, 0.27, 1.13, 0.46, 0.71, 0.29, 0.97, 0.41, 1.21];
  let time = 0;
  for (let repeat = 0; repeat < 3; repeat++) {
    for (const gap of gaps) {
      fillBand(freq, detector, 20, 160, 255);
      detector.update(freq, time);
      freq.fill(0);
      const frames = Math.round(gap * 60);
      for (let frame = 1; frame <= frames; frame++) {
        detector.update(freq, time + frame / 60);
      }
      time += frames / 60;
    }
  }
  assert.ok(detector.features.beatCount > 10);
  assert.equal(detector.features.bpm, null);
});

test('手工 PCM demo 为双声道、非静音、不削波且循环边界无跳变', () => {
  const context = {
    sampleRate: 4000,
    createBuffer(channels, length, sampleRate) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return {
        numberOfChannels: channels, length, sampleRate,
        duration: length / sampleRate,
        getChannelData(channel) { return data[channel]; }
      };
    }
  };
  const buffer = createDemoBuffer(context, 16, 120, 4000);
  assert.equal(buffer.numberOfChannels, 2);
  assert.equal(buffer.length, 64000);
  assert.equal(buffer.sampleRate, 4000);
  assert.equal(buffer.duration, 16);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  let peak = 0;
  let energy = 0;
  let stereoDifference = 0;
  for (let i = 0; i < buffer.length; i++) {
    assert.ok(Number.isFinite(left[i]) && Number.isFinite(right[i]));
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
    energy += left[i] * left[i] + right[i] * right[i];
    stereoDifference += Math.abs(left[i] - right[i]);
  }
  assert.ok(peak > 0.1 && peak <= 0.900001, `peak=${peak}`);
  assert.ok(energy > 1000, `energy=${energy}`);
  assert.ok(stereoDifference > 1, `stereoDifference=${stereoDifference}`);
  assert.ok(left[0] === 0 && right[0] === 0);
  assert.ok(left[left.length - 1] === 0 && right[right.length - 1] === 0);
});

test('AudioEngine 未初始化时 update 返回中性 features，音量可预先保存', () => {
  const engine = new AudioEngine();
  assert.deepEqual(engine.update(1), {
    bass: 0, mid: 0, high: 0, level: 0, flux: 0,
    beat: false, bpm: null, beatCount: 0
  });
  assert.equal(engine.setVolume(2), 1);
  assert.equal(engine.setVolume(-1), 0);
  assert.equal(engine.setVolume(0.42), 0.42);
  assert.equal(engine.context, null);
  assert.equal(engine.analyser, null);
  assert.equal(engine.element, null);
  assert.equal(engine.playing, false);
  assert.equal(engine.seek(3), 0);
  assert.deepEqual(engine.getState(), {
    playing: false, kind: null, trackName: '', duration: 0,
    currentTime: 0, volume: 0.42, bpm: null, beatCount: 0
  });
});
