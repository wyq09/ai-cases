#!/usr/bin/env node
/**
 * Node logic, build, and contract regression suite for 《最后半个像素》(Last Half Pixel).
 * Verifies:
 *  1. Syntax of all src/*.js modules & build.py
 *  2. Single-file build succeeds and produces index.html
 *  3. Zero external http(s) runtime dependencies & file:// offline compatibility
 *  4. LHP.math exports, deterministic PRNG, spline monotonicity, and GLSL chunks
 *  5. LHP.createAudio headless-safe contract & all required SFX / ambient params
 *  6. All 10 physical GLSL transitions in LHP.transitions
 *  7. All 10 scenes in LHP.scenesEarly + LHP.scenesLate, beat structure & Chinese speaker notes
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL: ${name}`);
    console.error(`        ${err && err.stack ? err.stack : err}`);
  }
}

console.log('Running last-half-pixel logic, build & contract tests...\n');

const EXPECTED_SRC_FILES = [
  'math.js',
  'gfx.js',
  'type.js',
  'audio.js',
  'transitions.js',
  'scenes-early.js',
  'scenes-late.js',
  'deck.js',
];

// 1. Source files exist & pass syntax checks
test('all source files, template.html, vendor/three.module.js, and build.py exist', () => {
  for (const f of EXPECTED_SRC_FILES) {
    const p = path.join(SRC, f);
    assert.ok(fs.existsSync(p), `Missing src/${f}`);
  }
  assert.ok(fs.existsSync(path.join(SRC, 'template.html')), 'Missing src/template.html');
  assert.ok(fs.existsSync(path.join(ROOT, 'vendor', 'three.module.js')), 'Missing vendor/three.module.js');
  assert.ok(fs.existsSync(path.join(ROOT, 'build.py')), 'Missing build.py');
});

test('all src/*.js pass `node --check` and build.py passes `py_compile`', () => {
  for (const f of EXPECTED_SRC_FILES) {
    execFileSync(process.execPath, ['--check', path.join(SRC, f)], { stdio: 'pipe' });
  }
  execFileSync('python3', ['-m', 'py_compile', path.join(ROOT, 'build.py')], { stdio: 'pipe' });
});

// 2. Build succeeds
test('python3 build.py succeeds and produces single-file index.html', () => {
  execFileSync('python3', [path.join(ROOT, 'build.py')], { cwd: ROOT, stdio: 'pipe' });
  const outPath = path.join(ROOT, 'index.html');
  assert.ok(fs.existsSync(outPath), 'index.html was not generated');
  const stat = fs.statSync(outPath);
  assert.ok(stat.size > 100_000, `index.html unexpectedly small (${stat.size} bytes)`);
});

// 3. Zero external runtime dependencies & file:// compatibility
test('index.html has zero external http(s) runtime dependencies and is file:// compatible', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  // Must not leave unreplaced template placeholders
  assert.ok(!/__INLINE_[A-Z0-9_]+__/.test(html), 'Unreplaced __INLINE_*__ placeholder found in index.html');

  // No external <script src>, <link href>, <img src>, <audio src>, <video src>, <source src>
  const extTagRe = /<(?:script|link|img|audio|video|source|iframe)\b[^>]*\b(?:src|href)\s*=\s*["']\s*https?:\/\//gi;
  const extTags = html.match(extTagRe);
  assert.equal(extTags, null, `Found external HTTP(S) tag resource: ${JSON.stringify(extTags)}`);

  // No external local relative <script src="..."> or <link rel="stylesheet" href="..."> (breaks single-file)
  const relScriptRe = /<script\b[^>]*\bsrc\s*=\s*["'][^"']+["']/gi;
  const relScripts = html.match(relScriptRe);
  assert.equal(relScripts, null, `Found non-inline <script src>: ${JSON.stringify(relScripts)}`);

  const relStyleRe = /<link\b[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi;
  const relStyles = html.match(relStyleRe);
  assert.equal(relStyles, null, `Found external stylesheet <link>: ${JSON.stringify(relStyles)}`);

  // No CSS @import url(http...) or font url(http...)
  const cssHttpRe = /url\(\s*["']?\s*https?:\/\//gi;
  const cssHttp = html.match(cssHttpRe);
  assert.equal(cssHttp, null, `Found external HTTP(S) CSS url(): ${JSON.stringify(cssHttp)}`);

  // No runtime fetch('http...') or dynamic import('http...')
  const jsHttpRe = /\b(?:fetch|import)\s*\(\s*["'`]\s*https?:\/\//gi;
  const jsHttp = html.match(jsHttpRe);
  assert.equal(jsHttp, null, `Found external HTTP(S) fetch/import: ${JSON.stringify(jsHttp)}`);

  // No type="module" inline script importing external files
  const moduleImportRe = /^\s*import\s+[^;]*from\s+["'](?:\.|\/|https?:)/gm;
  const modImports = html.match(moduleImportRe);
  assert.equal(modImports, null, `Found external ES import statement in bundle: ${JSON.stringify(modImports)}`);

  // Basic HTML sanity
  assert.ok(/<!doctype html>/i.test(html), 'Missing DOCTYPE');
  assert.ok(/<canvas\b/i.test(html), 'Missing <canvas> element');
});

// Helper: load modules in a clean VM sandbox to test contracts directly
function loadSandboxModules(files) {
  const win = {
    __LHP: {},
    innerWidth: 1440,
    innerHeight: 900,
    devicePixelRatio: 1,
    location: { hash: '', search: '' },
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false }),
    performance: { now: () => Date.now() },
  };
  win.window = win;
  win.self = win;
  win.globalThis = win;

  // Minimal THREE stub sufficient for module-load registration
  const THREE = {
    GLSL3: '300 es',
    Color: class { constructor(c) { this.c = c; } set() { return this; } },
    Vector2: class { constructor(x = 0, y = 0) { this.x = x; this.y = y; } set(x, y) { this.x = x; this.y = y; return this; } },
    Vector3: class { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } },
    Vector4: class { constructor(x = 0, y = 0, z = 0, w = 0) { this.x = x; this.y = y; this.z = z; this.w = w; } },
    Matrix4: class {},
    Quaternion: class {},
    AdditiveBlending: 2,
    NormalBlending: 1,
    DoubleSide: 2,
    FrontSide: 0,
    BackSide: 1,
    HalfFloatType: 1016,
    FloatType: 1015,
    UnsignedByteType: 1009,
    RGBAFormat: 1023,
    LinearFilter: 1006,
    NearestFilter: 1003,
    ClampToEdgeWrapping: 1001,
    RepeatWrapping: 1000,
    SRGBColorSpace: 'srgb',
    LinearSRGBColorSpace: 'srgb-linear',
    NoToneMapping: 0,
  };

  const sandbox = {
    window: win,
    self: win,
    globalThis: win,
    THREE,
    console,
    Math,
    Date,
    Number,
    String,
    Array,
    Object,
    Map,
    Set,
    Float32Array,
    Uint8Array,
    Uint16Array,
    Uint32Array,
    Int32Array,
    Promise,
    setTimeout,
    clearTimeout,
    performance: win.performance,
    navigator: { userAgent: 'node-test' },
    document: {
      createElement: () => ({ getContext: () => null, style: {} }),
      getElementById: () => null,
      querySelector: () => null,
    },
  };
  const ctx = vm.createContext(sandbox);
  for (const f of files) {
    const code = fs.readFileSync(path.join(SRC, f), 'utf8');
    vm.runInContext(code, ctx, { filename: `src/${f}` });
  }
  return win.__LHP;
}

const LHP = loadSandboxModules([
  'math.js',
  'audio.js',
  'transitions.js',
  'scenes-early.js',
  'scenes-late.js',
]);

// 4. LHP.math contract & unit tests
test('LHP.math exports all required utilities and GLSL shader chunks', () => {
  const m = LHP.math;
  assert.ok(m, 'LHP.math missing');
  for (const fn of ['clamp', 'lerp', 'smoothstep', 'ss', 'invLerp', 'damp', 'rng', 'hash', 'hexToRgb', 'spline']) {
    assert.equal(typeof m[fn], 'function', `LHP.math.${fn} must be a function`);
  }
  assert.ok(m.ease && typeof m.ease === 'object', 'LHP.math.ease missing');
  for (const e of ['lin', 'in2', 'out2', 'io2', 'in3', 'out3', 'io3', 'in4', 'out4', 'io4', 'outBack']) {
    assert.equal(typeof m.ease[e], 'function', `LHP.math.ease.${e} must be a function`);
  }

  // Numerical sanity
  assert.equal(m.clamp(-2, 0, 1), 0);
  assert.equal(m.clamp(5, 0, 1), 1);
  assert.equal(m.clamp(0.4, 0, 1), 0.4);
  assert.equal(m.lerp(10, 20, 0.25), 12.5);
  assert.equal(m.smoothstep(0, 1, 0), 0);
  assert.equal(m.smoothstep(0, 1, 1), 1);
  assert.equal(m.smoothstep(0, 1, 0.5), 0.5);
  assert.equal(m.ss(0, 1, 0.5), 0.5);
  assert.equal(m.invLerp(10, 20, 15), 0.5);
  const d = m.damp(6, 1 / 60);
  assert.ok(d > 0 && d < 1, `damp(6, 1/60) out of (0,1): ${d}`);

  // Easing endpoints
  for (const e of ['lin', 'in2', 'out2', 'io2', 'in3', 'out3', 'io3', 'in4', 'out4', 'io4', 'outBack']) {
    assert.ok(Math.abs(m.ease[e](0)) < 1e-6, `ease.${e}(0) should be 0`);
    assert.ok(Math.abs(m.ease[e](1) - 1) < 1e-6, `ease.${e}(1) should be 1`);
  }

  // Deterministic PRNG
  const r1 = m.rng(42);
  const r2 = m.rng(42);
  for (let i = 0; i < 20; i++) {
    const a = r1();
    const b = r2();
    assert.equal(a, b, 'rng(seed) must be deterministic');
    assert.ok(a >= 0 && a < 1, `rng value out of [0,1): ${a}`);
  }

  // hexToRgb
  const rgb = m.hexToRgb('#ff8000');
  assert.ok(Array.isArray(rgb) && rgb.length === 3);
  assert.ok(Math.abs(rgb[0] - 1) < 0.01 && Math.abs(rgb[1] - 128 / 255) < 0.01 && Math.abs(rgb[2]) < 0.01);

  // Monotone spline
  const sp = m.spline([[0, 0], [0.5, 0.4], [1, 1]]);
  assert.equal(typeof sp, 'function');
  assert.ok(Math.abs(sp(0)) < 1e-5);
  assert.ok(Math.abs(sp(0.5) - 0.4) < 1e-5);
  assert.ok(Math.abs(sp(1) - 1) < 1e-5);
  let prev = -Infinity;
  for (let x = 0; x <= 1; x += 0.05) {
    const y = sp(x);
    assert.ok(y >= prev - 1e-6, `spline not monotone at x=${x}`);
    prev = y;
  }

  // GLSL chunks
  assert.equal(typeof m.GLSL_HASH, 'string');
  assert.equal(typeof m.GLSL_NOISE, 'string');
  assert.equal(typeof m.GLSL_COLOR, 'string');
  for (const sym of ['hash12', 'hash13', 'hash21', 'hash22', 'hash33']) {
    assert.ok(m.GLSL_HASH.includes(sym), `GLSL_HASH missing ${sym}`);
  }
  for (const sym of ['vnoise', 'fbm', 'worley']) {
    assert.ok(m.GLSL_NOISE.includes(sym), `GLSL_NOISE missing ${sym}`);
  }
  for (const sym of ['toLin', 'toSrgb', 'luma']) {
    assert.ok(m.GLSL_COLOR.includes(sym), `GLSL_COLOR missing ${sym}`);
  }
});

// 5. LHP.createAudio headless-safe contract
test('LHP.createAudio works safely without AudioContext and supports all required SFX & params', () => {
  assert.equal(typeof LHP.createAudio, 'function', 'LHP.createAudio must be a function');
  const audio = LHP.createAudio();
  assert.ok(audio && typeof audio === 'object');
  for (const fn of ['unlock', 'mute', 'emit', 'hit', 'param', 'update']) {
    assert.equal(typeof audio[fn], 'function', `audio.${fn} must be a function`);
  }

  // Should never throw in headless environment
  audio.unlock();
  const sfxNames = [
    'type', 'click', 'tick', 'select', 'delete', 'whoosh', 'thud', 'snap',
    'pop', 'drip', 'riser', 'shimmer', 'chime', 'boom', 'sub', 'creak',
    'wave', 'paper', 'slam',
  ];
  for (const name of sfxNames) {
    audio.hit(name, { gain: 0.7, pitch: 1.0 });
  }
  for (const p of ['wind', 'water', 'hum', 'tension', 'speed', 'deep']) {
    audio.param(p, 0.5);
  }
  audio.emit('scene', { id: 'scale', beat: 0 });
  audio.emit('trans', { id: 'line', from: 'boring', to: 'scale' });
  audio.update(1 / 60, { scene: 'scale', beat: 1 });
  assert.equal(typeof audio.quiet, 'boolean', 'audio.quiet must be a boolean');
  audio.mute(true);
  audio.mute(false);
  audio.quiet = true;
  audio.hit('boom', { gain: 1 });
  audio.quiet = false;
});

// 6. All 10 transitions
const REQUIRED_TRANSITIONS = [
  'fade', 'line', 'wash', 'flaps', 'daybreak',
  'slam', 'fold', 'tear', 'portal-in', 'portal-out',
];

test('LHP.transitions defines all 10 required physical GLSL transitions', () => {
  assert.ok(LHP.transitions && typeof LHP.transitions === 'object', 'LHP.transitions missing');
  for (const id of REQUIRED_TRANSITIONS) {
    const tr = LHP.transitions[id];
    assert.ok(tr, `Missing transition: ${id}`);
    assert.ok(typeof tr.dur === 'number' && tr.dur > 0, `Transition ${id} invalid dur: ${tr.dur}`);
    assert.equal(typeof tr.create, 'function', `Transition ${id} missing create(ctx)`);
  }
});

// 7. All 10 scenes & beat contracts
const REQUIRED_SCENES = [
  { id: 'boring', enterWith: 'fade', minBeats: 3 },
  { id: 'scale', enterWith: 'line', minBeats: 4 },
  { id: 'breath', enterWith: 'wash', minBeats: 3 },
  { id: 'five', enterWith: 'flaps', minBeats: 3 },
  { id: 'window', enterWith: 'daybreak', minBeats: 3 },
  { id: 'coal', enterWith: 'slam', minBeats: 3 },
  { id: 'flicker', enterWith: 'fold', minBeats: 3 },
  { id: 'split', enterWith: 'tear', minBeats: 3 },
  { id: 'zoom', enterWith: 'portal-in', minBeats: 2 },
  { id: 'ending', enterWith: 'portal-out', minBeats: 3 },
];

test('LHP.scenesEarly (5) and LHP.scenesLate (5) define all 10 scenes in order with valid contracts', () => {
  assert.ok(Array.isArray(LHP.scenesEarly), 'LHP.scenesEarly must be an array');
  assert.ok(Array.isArray(LHP.scenesLate), 'LHP.scenesLate must be an array');
  assert.equal(LHP.scenesEarly.length, 5, `Expected 5 early scenes, got ${LHP.scenesEarly.length}`);
  assert.equal(LHP.scenesLate.length, 5, `Expected 5 late scenes, got ${LHP.scenesLate.length}`);

  const all = [...LHP.scenesEarly, ...LHP.scenesLate];
  const cjkRe = /[\u4e00-\u9fff]/;

  all.forEach((sc, idx) => {
    const spec = REQUIRED_SCENES[idx];
    assert.equal(sc.id, spec.id, `Scene #${idx + 1} id mismatch: expected ${spec.id}, got ${sc.id}`);
    assert.ok(typeof sc.title === 'string' && cjkRe.test(sc.title), `Scene ${sc.id} must have Chinese title`);
    assert.equal(sc.enterWith, spec.enterWith, `Scene ${sc.id} enterWith mismatch: expected ${spec.enterWith}, got ${sc.enterWith}`);
    assert.ok(LHP.transitions[sc.enterWith], `Scene ${sc.id} enterWith "${sc.enterWith}" not found in LHP.transitions`);
    assert.equal(typeof sc.create, 'function', `Scene ${sc.id} missing create(ctx)`);
    assert.ok(Array.isArray(sc.beats) && sc.beats.length >= spec.minBeats,
      `Scene ${sc.id} must have at least ${spec.minBeats} beats, got ${sc.beats?.length}`);

    sc.beats.forEach((b, bi) => {
      assert.ok(typeof b.dur === 'number' && b.dur > 0, `Scene ${sc.id} beat ${bi} invalid dur`);
      const noteText = (Array.isArray(sc.notes) && sc.notes[bi]) || b.note || '';
      assert.ok(typeof noteText === 'string' && cjkRe.test(noteText),
        `Scene ${sc.id} beat ${bi} missing Chinese speaker note (checked sc.notes[${bi}] and beat.note)`);
    });
  });
});

// 8. Check key scene-specific static markers (anchor on flicker, pointer on split)
test('scenes-late.js implements anchor() for flicker and pointer() interaction for split', () => {
  const lateSrc = fs.readFileSync(path.join(SRC, 'scenes-late.js'), 'utf8');
  assert.ok(/\banchor\s*\(/.test(lateSrc) || /\banchor\s*:/.test(lateSrc), 'Scene 7 (flicker) should expose anchor(s) for fold transition');
  assert.ok(/\bpointer\s*\(/.test(lateSrc) || /\bpointer\s*:/.test(lateSrc), 'Scene 8 (split) should expose pointer(type, x, y, s) for interactive divider');
});

// 9. Check gfx.js, type.js, deck.js register expected LHP exports
test('gfx.js, type.js, and deck.js expose required LHP APIs', () => {
  const gfxSrc = fs.readFileSync(path.join(SRC, 'gfx.js'), 'utf8');
  const typeSrc = fs.readFileSync(path.join(SRC, 'type.js'), 'utf8');
  const deckSrc = fs.readFileSync(path.join(SRC, 'deck.js'), 'utf8');

  assert.ok(/LHP\.createGfx\s*=/.test(gfxSrc), 'gfx.js must set LHP.createGfx');
  assert.ok(/LHP\.createType\s*=/.test(typeSrc), 'type.js must set LHP.createType');
  assert.ok(/LHP\.SelectBox\s*=/.test(typeSrc), 'type.js must set LHP.SelectBox');
  assert.ok(/LHP\.Rect2D\s*=/.test(typeSrc), 'type.js must set LHP.Rect2D');
  assert.ok(/LHP\.createDeck\s*=/.test(deckSrc), 'deck.js must set LHP.createDeck');
  assert.ok(/window\.__deck\s*=/.test(deckSrc), 'deck.js must expose window.__deck');
  assert.ok(/window\.ready\s*=\s*true/.test(deckSrc), 'deck.js must set window.ready = true');
});

console.log(`\nResult: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
