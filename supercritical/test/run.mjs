#!/usr/bin/env node
/**
 * Node logic, build, data & contract regression suite for 《超临界》SUPERCRITICAL.
 * Run with: node supercritical/test/run.mjs
 *
 * Verifies:
 *  1. All source modules, template, vendor and build.py exist and pass syntax checks
 *  2. build.py produces a single-file index.html with zero external runtime dependencies
 *  3. SC.math numerics (easing, PRNG, monotone spline, GLSL chunks)
 *  4. Data integrity: every number the slides lean on is internally consistent
 *  5. Scene contracts: 14 scenes in order, beats, transitions, Chinese speaker notes
 *  6. Transition & sound design tables line up with the audio bank
 *  7. SC.createAudio is headless-safe; every transition recipe only references real sounds
 *  8. No GLSL reserved words used as identifiers in any shader source
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

console.log('Running supercritical logic, build, data & contract tests...\n');

const ENGINE = ['math.js', 'gfx.js', 'type.js', 'audio.js', 'deck.js'];
const MODULES = [...ENGINE.filter((f) => f !== 'deck.js'), 'kit.js', 'data.js', 'beds.js', 'transitions.js', 'scenes-a.js', 'scenes-b.js', 'scenes-c.js', 'deck.js'];
const EXPECTED = [
  ['brief', 'fade', 4, false],
  ['fold', 'plot', 5, false],
  ['compute', 'burn', 4, false],
  ['price', 'drop', 4, false],
  ['horizon', 'stretch', 4, false],
  ['lab', 'ring', 10, false],
  ['critical', 'burn', 5, false],
  ['good', 'rewind', 5, false],
  ['zeno', 'zeno', 4, false],
  ['nation', 'shockwave', 4, false],
  ['science', 'halftone', 4, false],
  ['scale', 'zoom', 6, false],
  ['white', 'overexpose', 3, true],
  ['luck', 'fade', 3, true],
];
const CJK = /[\u4e00-\u9fff]/;

// ---------------------------------------------------------------------------
// 1. Sources & syntax
// ---------------------------------------------------------------------------
test('all source modules, template, vendor files and build.py exist', () => {
  for (const f of MODULES) assert.ok(fs.existsSync(path.join(SRC, f)), `Missing src/${f}`);
  assert.ok(fs.existsSync(path.join(SRC, 'template.html')), 'Missing src/template.html');
  assert.ok(fs.existsSync(path.join(ROOT, 'vendor', 'three.module.js')), 'Missing vendor/three.module.js');
  assert.ok(fs.existsSync(path.join(ROOT, 'vendor', 'LICENSE-three.txt')), 'Missing vendor/LICENSE-three.txt');
  assert.ok(fs.existsSync(path.join(ROOT, 'build.py')), 'Missing build.py');
});

test('every src/*.js passes `node --check`; build.py passes `py_compile`', () => {
  for (const f of MODULES) execFileSync(process.execPath, ['--check', path.join(SRC, f)], { stdio: 'pipe' });
  execFileSync('python3', ['-m', 'py_compile', path.join(ROOT, 'build.py')], { stdio: 'pipe' });
});

// ---------------------------------------------------------------------------
// 2. Build
// ---------------------------------------------------------------------------
test('python3 build.py succeeds and produces a single-file index.html', () => {
  execFileSync('python3', [path.join(ROOT, 'build.py')], { cwd: ROOT, stdio: 'pipe' });
  const out = path.join(ROOT, 'index.html');
  assert.ok(fs.existsSync(out), 'index.html was not generated');
  const size = fs.statSync(out).size;
  assert.ok(size > 1_000_000, `index.html unexpectedly small (${size} bytes)`);
  const html = fs.readFileSync(out, 'utf8');
  for (const f of MODULES) assert.ok(html.includes(`/* ===== ${f} ===== */`), `bundle is missing ${f}`);
});

test('index.html has zero external http(s) runtime dependencies and is file:// compatible', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(!/\/\*INLINE_BUNDLE\*\//.test(html), 'Unreplaced /*INLINE_BUNDLE*/ placeholder');
  const extTagRe = /<(?:script|link|img|audio|video|source|iframe)\b[^>]*\b(?:src|href)\s*=\s*["']\s*https?:\/\//gi;
  assert.equal(html.match(extTagRe), null, 'External HTTP(S) tag resource found');
  assert.equal(html.match(/<script\b[^>]*\bsrc\s*=\s*["'][^"']+["']/gi), null, 'Non-inline <script src> found');
  assert.equal(html.match(/<link\b[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi), null, 'External stylesheet found');
  assert.equal(html.match(/url\(\s*["']?\s*https?:\/\//gi), null, 'External HTTP(S) CSS url() found');
  assert.equal(html.match(/\b(?:fetch|import)\s*\(\s*["'`]\s*https?:\/\//gi), null, 'Runtime fetch/import of an external URL');
  assert.equal(html.match(/^\s*import\s+[^;]*from\s+["'](?:\.|\/|https?:)/gm), null, 'External ES import in bundle');
  assert.ok(/<!doctype html>/i.test(html) && /<canvas\b/i.test(html), 'HTML sanity');
  assert.ok(/"authorLines":\s*\d+/.test(html), 'SC.BUILD build info missing');
});

// ---------------------------------------------------------------------------
// Load modules in a clean VM sandbox (no DOM, no WebGL) to test contracts directly
// ---------------------------------------------------------------------------
function loadSandbox() {
  const win = {
    __SC: {},
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
  const Vec = class {
    constructor(x = 0, y = 0, z = 0, w = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
      this.w = w;
    }
    set(x, y, z, w) {
      if (x !== undefined) this.x = x;
      if (y !== undefined) this.y = y;
      if (z !== undefined) this.z = z;
      if (w !== undefined) this.w = w;
      return this;
    }
  };
  const THREE = {
    GLSL3: '300 es',
    Vector2: Vec,
    Vector3: Vec,
    Vector4: Vec,
    Color: class {
      constructor(c) {
        this.c = c;
      }
    },
    HalfFloatType: 1016,
    FloatType: 1015,
    UnsignedByteType: 1009,
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
    // readyState 'loading' keeps deck.js from auto-booting (it only registers a DOMContentLoaded listener)
    document: {
      readyState: 'loading',
      addEventListener() {},
      createElement: () => ({ getContext: () => null, style: {} }),
      getElementById: () => null,
      querySelector: () => null,
    },
  };
  const ctx = vm.createContext(sandbox);
  for (const f of MODULES) {
    vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: `src/${f}` });
  }
  return win.__SC;
}
const SC = loadSandbox();
const D = SC.D;

// ---------------------------------------------------------------------------
// 3. Math
// ---------------------------------------------------------------------------
test('SC.math exports all utilities and GLSL chunks with sound numerics', () => {
  const m = SC.math;
  for (const fn of ['clamp', 'lerp', 'smoothstep', 'ss', 'invLerp', 'damp', 'rng', 'hash', 'hexToRgb', 'spline']) {
    assert.equal(typeof m[fn], 'function', `SC.math.${fn}`);
  }
  for (const e of ['lin', 'in2', 'out2', 'io2', 'in3', 'out3', 'io3', 'in4', 'out4', 'io4', 'outBack']) {
    assert.equal(typeof m.ease[e], 'function', `ease.${e}`);
    assert.ok(Math.abs(m.ease[e](0)) < 1e-6 && Math.abs(m.ease[e](1) - 1) < 1e-6, `ease.${e} endpoints`);
  }
  assert.ok(m.ease.outBack(0.6) > 1, 'outBack is the one easing that overshoots on purpose');
  for (const e of ['lin', 'in2', 'out2', 'io2', 'in3', 'out3', 'io3', 'in4', 'out4', 'io4']) {
    let prev = -1e9;
    for (let x = 0; x <= 1; x += 0.05) {
      assert.ok(m.ease[e](x) >= prev - 1e-9, `ease.${e} not monotone at ${x}`);
      prev = m.ease[e](x);
    }
  }
  assert.equal(m.clamp(-2), 0);
  assert.equal(m.clamp(5), 1);
  assert.equal(m.lerp(10, 20, 0.25), 12.5);
  assert.equal(m.smoothstep(0, 1, 0.5), 0.5);
  assert.equal(m.invLerp(10, 20, 15), 0.5);
  assert.ok(m.damp(6, 1 / 60) > 0 && m.damp(6, 1 / 60) < 1);
  // reversed edges are used on purpose throughout the scenes (fade-in as a value approaches)
  assert.equal(m.smoothstep(7, 2, 9), 0);
  assert.equal(m.smoothstep(7, 2, 1), 1);
  const r1 = m.rng(42);
  const r2 = m.rng(42);
  for (let i = 0; i < 40; i++) {
    const a = r1();
    assert.equal(a, r2(), 'rng(seed) must be deterministic');
    assert.ok(a >= 0 && a < 1);
  }
  const rgb = m.hexToRgb('#ff4a1c');
  assert.ok(Math.abs(rgb[0] - 1) < 0.01 && Math.abs(rgb[1] - 74 / 255) < 0.01 && Math.abs(rgb[2] - 28 / 255) < 0.01);
  const sp = m.spline([[0, 0], [0.5, 0.4], [1, 1]]);
  assert.ok(Math.abs(sp(0.5) - 0.4) < 1e-6);
  let prevY = -Infinity;
  for (let x = 0; x <= 1; x += 0.05) {
    assert.ok(sp(x) >= prevY - 1e-6, 'spline not monotone');
    prevY = sp(x);
  }
  for (const sym of ['hash12', 'hash13', 'hash21', 'hash22', 'hash33']) assert.ok(m.GLSL_HASH.includes(sym), `GLSL_HASH ${sym}`);
  for (const sym of ['vnoise', 'fbm', 'worley']) assert.ok(m.GLSL_NOISE.includes(sym), `GLSL_NOISE ${sym}`);
  for (const sym of ['toLin', 'toSrgb', 'luma', 'blackbody']) assert.ok(m.GLSL_COLOR.includes(sym), `GLSL_COLOR ${sym}`);
});

// ---------------------------------------------------------------------------
// 4. Data integrity — the numbers the slides shout must agree with each other
// ---------------------------------------------------------------------------
test('S1 · the brief is stored verbatim and the deck knows its own size', () => {
  assert.ok(D.BRIEF.startsWith('做一份关于AI未来的演示文稿，基本上就是讲智能爆炸。'), 'brief opening');
  assert.ok(D.BRIEF.endsWith('祝你好运，'), 'brief must end with the words handed back in the finale');
  assert.ok(Array.from(D.BRIEF).length >= 120, 'brief length');
  assert.match(D.BRIEF_DATE, /^2026\.\d\d\.\d\d$/);
});

test('S2 · paper folding arithmetic: 0.1 mm × 2^42 reaches the Moon, the last 12 folds are 99.98%', () => {
  const f = D.FOLD;
  const km = (n) => (f.base * Math.pow(2, n)) / 1e6;
  assert.ok(Math.abs(km(42) - 439805) < 1, `42 folds = ${km(42)} km`);
  assert.ok(km(26) < 8.849 && km(27) > 8.849, 'Everest is crossed between folds 26 and 27');
  assert.ok(km(30) > 100 && km(29) < 100, 'the Kármán line is crossed at fold 30');
  assert.ok(km(41) > 384400 / 2 && km(41) < 384400, 'fold 41 is past halfway to the Moon');
  assert.ok(Math.abs((1 - Math.pow(2, -12)) * 100 - 99.9756) < 0.01);
  for (const [n, , dist] of f.marks) assert.ok(n >= 0 && n <= 42 && CJK.test(dist), `bad mark ${n}`);
});

test('S3 · training compute: frontier is sorted, grows two-billion-fold, cloud sits below it', () => {
  const pts = D.COMPUTE.map(([d, , f]) => [D.dy(d), f]);
  for (let i = 1; i < pts.length; i++) {
    assert.ok(pts[i][0] > pts[i - 1][0], 'frontier dates must ascend');
    assert.ok(pts[i][1] >= pts[i - 1][1], 'frontier compute must be non-decreasing');
  }
  const ratio = pts[pts.length - 1][1] / pts[0][1];
  assert.ok(ratio > 1.9e9 && ratio < 2.1e9, `AlexNet → latest = ${ratio.toExponential(2)}`);
  assert.ok(Math.abs(Math.log2(ratio) - 31) < 0.5, `doublings = ${Math.log2(ratio)}`);
  const yrs = pts[pts.length - 1][0] - pts[0][0];
  assert.ok(yrs > 13.5 && yrs < 14.5, `span ${yrs}`);
  const perYear = Math.pow(pts[6][1] / pts[0][1], 1 / (pts[6][0] - pts[0][0]));
  assert.ok(perYear > 4.8 && perYear < 5.6, `2012–2025 growth ${perYear}/yr`);
  const late = pts[8][1] / pts[6][1];
  assert.ok(late > 2 && late < 3.2, `2025–2026 growth ${late}`);
  const top = pts[pts.length - 1][1];
  for (const [d, , f] of D.COMPUTE_CLOUD) {
    assert.ok(f < top, `${d} cloud model above frontier`);
    assert.ok(D.dy(d) >= 2024.9 && D.dy(d) <= 2026.95, `${d} outside the stated window`);
  }
  // the dashed "old slope" line on the slide
  const kF = pts[6][1] * Math.pow(5.2, pts[8][0] - pts[6][0]);
  assert.ok(kF > 4e27 && kF < 5e27, `old-slope projection ${kF.toExponential(2)}`);
});

test('S4 · price: the multipliers quoted on the slide follow from the listed prices', () => {
  const g = D.PRICE.gpt4;
  assert.ok(Math.abs(g[0][1] / g[2][1] - 536) < 4, `GPT-4-level drop ${g[0][1] / g[2][1]}`);
  const months = (D.dy(g[2][0]) - D.dy(g[0][0])) * 12;
  assert.ok(Math.abs(months - 19) < 1, `${months} months`);
  const q = D.PRICE.gpqa;
  assert.ok(Math.abs(q[0][1] / q[1][1] - 725) < 40, `GPQA drop ${q[0][1] / q[1][1]}`);
  assert.ok((D.dy(q[1][0]) - D.dy(q[0][0])) * 12 < 18.5, 'GPQA window under 18 months');
  assert.equal(D.PRICE.perYear, 13);
  assert.ok(Math.abs(Math.pow(1 - D.PRICE.perQuarter, 4) * D.PRICE.perYear - 1) < 0.05, '47%/quarter ≈ 13×/year');
  // Epoch: AI's price decline is 4× / 6× / 18× / 54× faster than sequencing / compute / batteries / electricity.
  // Read as ratios of the log decline rate: the other technology needs that many years to match one AI year.
  const byName = Object.fromEntries(D.PRICE.tech.map(([n, y, m]) => [n, [y, m]]));
  assert.equal(byName['AI 推理'][0], 1);
  assert.ok(Math.abs(byName['DNA 测序'][0] - 4) < 1e-9, 'DNA sequencing: 4 years');
  assert.ok(Math.abs(byName['算力 · 摩尔定律'][0] - 6) < 1e-9, 'compute: 6 years');
  assert.ok(Math.abs(byName['锂电池'][0] - 18) < 1e-9, 'batteries: 18 years');
  assert.ok(Math.abs(byName['电力 1892–1973'][0] - 54) < 1e-9, 'electricity: 54 years');
  for (const [name, yrs, mult] of D.PRICE.tech) {
    assert.ok(Math.abs(Math.pow(mult, yrs) - D.PRICE.perYear) < 1e-6, `${name}: ${yrs} years at ×${mult.toFixed(3)} must compound to 13`);
    assert.ok(CJK.test(name), name);
  }
  assert.ok(byName['电力 1892–1973'][1] > 1.04 && byName['电力 1892–1973'][1] < 1.06, 'electricity ≈ 5%/yr, the historical figure');
  assert.ok(byName['算力 · 摩尔定律'][1] > 1.5 && byName['算力 · 摩尔定律'][1] < 1.6, 'compute ≈ doubling every 18 months');
});

test('S5 · time horizons: since-2023 doubling agrees with METR, extrapolations follow the fit', () => {
  const rows = D.HORIZON;
  for (let i = 1; i < rows.length; i++) assert.ok(D.dy(rows[i][0]) > D.dy(rows[i - 1][0]), 'horizon dates ascend');
  for (const [, , m, lo, hi] of rows) assert.ok(lo <= m && m <= hi, 'p50 inside its CI');
  const recent = rows.filter((r) => D.dy(r[0]) >= 2023).map((r) => [D.dy(r[0]), Math.log10(r[2])]);
  const mt = recent.reduce((a, r) => a + r[0], 0) / recent.length;
  const my = recent.reduce((a, r) => a + r[1], 0) / recent.length;
  const slope = recent.reduce((a, r) => a + (r[0] - mt) * (r[1] - my), 0) / recent.reduce((a, r) => a + (r[0] - mt) ** 2, 0);
  const dbl = (Math.log10(2) / slope) * 12;
  assert.ok(dbl > 3.6 && dbl < 5.2, `since-2023 doubling ${dbl.toFixed(2)} months (METR: 4.2)`);
  const ia = my - slope * mt;
  const when = (min) => (Math.log10(min) - ia) / slope;
  assert.ok(when(1440) < D.NOW, 'a full day is already behind us on the trend line');
  assert.ok(when(10080) > 2027.3 && when(10080) < 2028, `one week → ${when(10080).toFixed(2)}`);
  assert.ok(when(43800) > 2028 && when(43800) < 2029, `one month → ${when(43800).toFixed(2)}`);
  assert.ok(when(525600) > 2029 && when(525600) < 2030.5, `one year → ${when(525600).toFixed(2)}`);
  assert.ok(Math.abs(D.HORIZON_DOUBLE_MONTHS - 4.2) < 1e-9);
});

test('S5 · benchmark small multiples: scores ascend and stay in [0, 1]', () => {
  assert.equal(D.BENCH.length, 3);
  for (const b of D.BENCH) {
    assert.ok(CJK.test(b.name + b.note), 'benchmark caption');
    assert.ok(b.rows.length >= 5, `${b.name} rows`);
    for (let i = 1; i < b.rows.length; i++) {
      assert.ok(D.dy(b.rows[i][0]) > D.dy(b.rows[i - 1][0]), `${b.name} dates`);
      assert.ok(b.rows[i][1] >= b.rows[i - 1][1], `${b.name} scores`);
    }
    for (const [, v] of b.rows) assert.ok(v >= 0 && v <= 1, `${b.name} score range`);
    const gain = b.rows[b.rows.length - 1][1] - b.rows[0][1];
    assert.ok(gain > 0.4, `${b.name} gain ${gain}`);
  }
});

test('S6 · eight research stages, each with a named system, org, date and description', () => {
  assert.equal(D.LAB.length, 8);
  const seen = new Set();
  for (const [stage, system, org, date, desc] of D.LAB) {
    assert.ok(!seen.has(stage), `duplicate stage ${stage}`);
    seen.add(stage);
    for (const field of [stage, system, org, date, desc]) assert.ok(typeof field === 'string' && field.trim().length > 0, `${stage}: ${field}`);
    assert.match(date, /^(19|20)\d\d(\.\d\d)?\s?(→)?$/);
  }
});

test('S8 · quotes are complete and the survey horizon only moves closer', () => {
  for (const key of ['turing', 'good', 'vinge', 'wiener', 'minsky', 'kurzweil', 'amodei']) {
    const q = D.QUOTES[key];
    for (const f of ['who', 'when', 'src', 'zh', 'en']) assert.ok(q && typeof q[f] === 'string' && q[f].length > 3, `${key}.${f}`);
    assert.ok(CJK.test(q.zh) && /[A-Za-z]{4}/.test(q.en), `${key} bilingual`);
  }
  assert.ok(D.QUOTES.good.en.includes('intelligence explosion'), 'Good 1965 must contain the coined term');
  assert.ok(D.QUOTES.vinge.en.includes('the human era will be ended'));
  assert.ok(D.QUOTES.turing.en.includes('take control'));
  for (let i = 1; i < D.SURVEY.length; i++) {
    assert.ok(+D.SURVEY[i][0] > +D.SURVEY[i - 1][0], 'survey years ascend');
    assert.ok(D.SURVEY[i][1] < D.SURVEY[i - 1][1], 'predicted date moves earlier');
  }
  // 45 years out in 2016, 18 years out in 2024: the horizon closed by ~3.4 years per year
  const out = (i) => D.SURVEY[i][1] - +D.SURVEY[i][0];
  const perYear = (out(0) - out(D.SURVEY.length - 1)) / (+D.SURVEY[D.SURVEY.length - 1][0] - +D.SURVEY[0][0]);
  assert.ok(Math.abs(perYear - 3.4) < 0.2, `horizon drift ${perYear.toFixed(2)} yr/yr`);
  for (const [who, when, py, q] of D.FORECASTS) {
    assert.ok(CJK.test(who) && CJK.test(q), who);
    assert.match(when, /^20\d\d\.\d\d$/);
    assert.ok(py >= 2026 && py <= 2035, `${who}: ${py}`);
  }
});

test('S9/S11/S12 · century arithmetic, structure grid and the power ladder are exact', () => {
  for (const [yr, label, span] of D.ZENO) {
    assert.ok(Math.abs(span - 100 / Math.pow(2, yr)) / span < 0.02, `zeno row ${label}`);
    assert.ok(CJK.test(label), label);
  }
  assert.ok(D.ZENO[D.ZENO.length - 1][2] * 365.25 * 24 < 14, '16 years of doubling → under 14 hours per century');
  const s = D.SCI;
  assert.equal(s.cols * s.rows * s.perCell, s.alphafold, 'the grid must sum to the AlphaFold count');
  assert.equal(s.cols * s.rows, 12500);
  assert.ok(s.pdb / s.perCell > 11 && s.pdb / s.perCell < 13, 'human structures fit in the first twelve cells');
  let prev = 0;
  for (const r of D.SCALE) {
    assert.ok(r.w > prev, 'power ladder ascends');
    prev = r.w;
    assert.ok(CJK.test(r.name) && CJK.test(r.note) && /\d/.test(r.exp), r.name);
  }
  assert.equal(D.SCALE[0].w, 20);
  assert.ok(Math.abs(D.SCALE[1].w / 20 - 1.125e9) < 1, 'Three Gorges in brains');
  assert.ok(Math.abs(D.SCALE[3].w / D.SCALE[2].w - 48333) < 400, 'sunlight vs. world electricity');
  assert.ok(D.SCALE[4].w / D.SCALE[2].w > 1e14, 'the Sun vs. world electricity');
  assert.ok(D.ECON.chatgptWeekly >= 1.2e9 && D.ECON.researchers === 900);
});

// ---------------------------------------------------------------------------
// 5. Scene contracts
// ---------------------------------------------------------------------------
test('14 scenes register in order with valid beats, transitions and page labels', () => {
  assert.ok(Array.isArray(SC.scenes), 'SC.scenes');
  assert.equal(SC.scenes.length, 14);
  SC.scenes.forEach((sc, idx) => {
    const [id, enterWith, minBeats, light] = EXPECTED[idx];
    assert.equal(sc.id, id, `scene #${idx + 1} is ${sc.id}`);
    assert.ok(typeof sc.title === 'string' && CJK.test(sc.title), `${id} title`);
    assert.equal(sc.enterWith, enterWith, `${id} enterWith`);
    assert.ok(SC.transitions[sc.enterWith], `${id} enterWith "${sc.enterWith}" has no transition`);
    assert.equal(typeof sc.create, 'function', `${id} create`);
    assert.equal(!!sc.light, light, `${id} light flag`);
    assert.ok(Array.isArray(sc.beats) && sc.beats.length >= minBeats, `${id}: expected ≥ ${minBeats} beats`);
    assert.equal(typeof sc.page, 'function', `${id} page()`);
    assert.equal(sc.page({ beat: 0 }), `${String(idx + 1).padStart(2, '0')} / 14`, `${id} page label`);
    assert.ok(Number.isInteger(sc.thumbBeat) && sc.thumbBeat >= 0 && sc.thumbBeat < sc.beats.length, `${id} thumbBeat`);
    for (const [bi, b] of sc.beats.entries()) {
      assert.ok(typeof b.dur === 'number' && b.dur > 0 && b.dur < 20, `${id} beat ${bi} dur`);
      if (b.hold != null) assert.ok(b.hold >= 0 && b.hold <= 30, `${id} beat ${bi} hold`);
    }
  });
});

test('every one of the 65 beats has a substantive Chinese speaker note', () => {
  let total = 0;
  for (const sc of SC.scenes) {
    assert.ok(Array.isArray(sc.notes), `${sc.id} notes`);
    assert.ok(sc.notes.length >= sc.beats.length, `${sc.id}: ${sc.notes.length} notes for ${sc.beats.length} beats`);
    for (const n of sc.notes) {
      assert.ok(typeof n === 'string' && CJK.test(n) && n.trim().length >= 8, `${sc.id}: thin note "${n}"`);
    }
    total += sc.notes.length;
  }
  assert.equal(total, 65);
});

// ---------------------------------------------------------------------------
// 6. Transitions and sound design line up
// ---------------------------------------------------------------------------
test('12 transitions exist with positive durations and a sound recipe each', () => {
  const names = ['fade', 'plot', 'burn', 'drop', 'stretch', 'ring', 'rewind', 'zeno', 'shockwave', 'zoom', 'overexpose', 'halftone'];
  for (const n of names) {
    const t = SC.transitions[n];
    assert.ok(t, `transition ${n}`);
    assert.ok(typeof t.dur === 'number' && t.dur >= 0.5 && t.dur <= 3, `${n} dur`);
    assert.equal(typeof t.create, 'function', `${n} create`);
    assert.equal(typeof SC.TRANSOUNDS[n], 'function', `${n} has no sound recipe`);
  }
  for (const n of Object.keys(SC.TRANSOUNDS)) assert.ok(SC.transitions[n], `sound recipe for unknown transition ${n}`);
});

test('every scene has a bed built only from real pads and buses', () => {
  const pads = new Set(SC.AUDIO_BANK.pads);
  for (const sc of SC.scenes) {
    const bed = SC.BEDS[sc.id];
    assert.ok(bed, `no bed for ${sc.id}`);
    assert.ok(bed.trim > 0 && bed.trim <= 1, `${sc.id} trim`);
    assert.equal(bed.mix.length, 3);
    assert.ok(Array.isArray(bed.voices) && bed.voices.length >= 1, `${sc.id} voices`);
    for (const v of bed.voices) {
      assert.ok(pads.has(v.pad), `${sc.id}: unknown pad ${v.pad}`);
      assert.ok(typeof v.h === 'number' && v.h > 0 && v.h < 200, `${sc.id}: bad harmonic ${v.h}`);
      assert.ok(typeof v.g === 'number' && v.g >= 0 && v.g <= 1, `${sc.id}: bad gain ${v.g}`);
      assert.ok(!v.bus || ['mid', 'wet', 'dry'].includes(v.bus), `${sc.id}: bad bus ${v.bus}`);
      for (const tbl of [v.steps, v.cuts]) {
        if (!tbl) continue;
        for (const k of Object.keys(tbl)) {
          assert.ok(+k >= 0 && +k < sc.beats.length, `${sc.id}: step beat ${k} out of range`);
          assert.ok(typeof tbl[k] === 'number' && tbl[k] > 0, `${sc.id}: bad step value`);
        }
      }
    }
  }
  for (const id of Object.keys(SC.BEDS)) assert.ok(SC.scenes.some((s) => s.id === id), `bed for unknown scene ${id}`);
});

test('the score heats up: Act III beds carry more voices and gain than Act I', () => {
  const weight = (id) => SC.BEDS[id].voices.reduce((a, v) => a + v.g, 0) * SC.BEDS[id].trim;
  const act1 = ['fold', 'compute', 'price', 'horizon'].reduce((a, id) => a + weight(id), 0) / 4;
  const act3 = ['nation', 'science', 'scale'].reduce((a, id) => a + weight(id), 0) / 3;
  assert.ok(act3 > act1 * 1.5, `Act III ${act3.toFixed(2)} vs Act I ${act1.toFixed(2)}`);
  assert.ok(weight('white') < 0.1 && weight('luck') < 0.2, 'the white scenes stay near silence');
  assert.ok(SC.BEDS.critical.voices.some((v) => Math.abs(v.h - 12.7) < 1e-9), 'a tritone sits on the criticality hinge');
});

// ---------------------------------------------------------------------------
// 7. Audio is headless-safe; recipes only reference real sounds
// ---------------------------------------------------------------------------
test('SC.createAudio never throws without an AudioContext and accepts every SFX and param', () => {
  assert.equal(typeof SC.createAudio, 'function');
  const audio = SC.createAudio();
  for (const fn of ['unlock', 'mute', 'emit', 'hit', 'param', 'update']) assert.equal(typeof audio[fn], 'function', `audio.${fn}`);
  audio.unlock();
  for (const name of SC.AUDIO_BANK.sfx) audio.hit(name, { gain: 0.7, pitch: 1.1 });
  for (const p of ['wind', 'water', 'hum', 'tension', 'speed', 'deep']) audio.param(p, 0.5);
  for (const sc of SC.scenes) {
    audio.update(1 / 60, { scene: sc.id, beat: 0 });
    audio.emit('beat', { scene: sc.id, beat: 1 });
    for (const tr of Object.keys(SC.transitions)) {
      audio.emit('transition', { name: tr, from: sc.id, to: sc.id, dur: 1.2, reverse: false });
    }
  }
  audio.mute(true);
  audio.mute(false);
  assert.equal(typeof audio.quiet, 'boolean');
});

test('every transition recipe schedules real sounds, real pads and sane times', () => {
  const noisePads = new Set(['pink', 'brown', 'hiss', 'rip']);
  const padPads = new Set(['low', 'warm', 'strings', 'organ', 'choir', 'hum', 'solo', 'sine']);
  let total = 0;
  for (const [name, recipe] of Object.entries(SC.TRANSOUNDS)) {
    const seen = { hit: 0, noise: 0, pad: 0, total: 0 };
    const checkU = (u, what) => assert.ok(typeof u === 'number' && u >= 0 && u <= 1.6, `${name}: ${what} at u=${u}`);
    recipe({
      E: {},
      name,
      r: 1.6,
      t0: 0,
      rng: Math.random,
      at: (u) => {
        checkU(u, 'at()');
        return u * 1.6;
      },
      H: (n) => 32.703 * n,
      lerp: (a, b, t) => a + (b - a) * t,
      clamp: (x, a = 0, b = 1) => Math.min(b, Math.max(a, x)),
      noiseSweep: (pad, type, gainPts, freqPts) => {
        assert.ok(noisePads.has(pad), `${name}: noise pad ${pad}`);
        assert.ok(['lowpass', 'bandpass', 'highpass'].includes(type), `${name}: filter ${type}`);
        for (const [u] of gainPts) checkU(u, 'noise gain point');
        for (const [u] of freqPts) checkU(u, 'noise freq point');
        seen.noise++;
      },
      padSweep: (pad, f, gainPts) => {
        assert.ok(padPads.has(pad), `${name}: pad ${pad}`);
        assert.ok(f > 20 && f < 20000, `${name}: pad freq ${f}`);
        for (const [u] of gainPts) checkU(u, 'pad gain point');
        seen.pad++;
      },
      hitAt: (sfxName, u) => {
        assert.ok(SC.AUDIO_BANK.sfx.includes(sfxName), `${name}: unknown SFX "${sfxName}"`);
        checkU(u, 'hit');
        seen.hit++;
      },
      setTotal: (d) => {
        assert.ok(typeof d === 'number' && d >= 1.6 && d <= 8, `${name}: total ${d}`);
        seen.total++;
      },
    });
    assert.ok(seen.hit >= 1 && seen.total === 1, `${name}: needs at least one hit and exactly one setTotal`);
    total += seen.hit;
  }
  assert.ok(total >= 30, `only ${total} scheduled hits across the transitions`);
});

// ---------------------------------------------------------------------------
// 8. Shader hygiene
// ---------------------------------------------------------------------------
test('no GLSL ES 3.00 reserved word is used as an identifier in any shader source', () => {
  const reserved = /(float|vec[234]|int|bool|mat[234]|ivec[234]|bvec[234])\s+(half|fixed|superp|partition|active|common|resource|patch|sample|subroutine|filter|input|output|typedef|template|packed|goto|inline|noinline|volatile|public|static|extern|external|interface|long|short|double|unsigned|union|enum|asm)\b/;
  for (const f of MODULES) {
    const src = fs.readFileSync(path.join(SRC, f), 'utf8');
    const m = src.match(reserved);
    assert.equal(m, null, `${f}: reserved word "${m && m[2]}" declared as "${m && m[0]}"`);
  }
  // every custom fullscreen pass gets the same prelude, so the helpers it relies on must exist
  const pre = SC.kit.GLSL_PRE;
  for (const sym of ['vec2 stage()', 'float pxUnit()', 'float sdSeg', 'float sdBox', 'float gridLine', 'float fillAA', 'float strokeAA', 'uniform vec4 uView']) {
    assert.ok(pre.includes(sym), `kit.GLSL_PRE missing ${sym}`);
  }
  const trSrc = fs.readFileSync(path.join(SRC, 'transitions.js'), 'utf8');
  assert.ok(trSrc.includes('uniform float uP;'), 'transitions prelude must declare uP');
});

test('scene helper surface: kit exposes what every scene file uses', () => {
  const k = SC.kit;
  for (const fn of ['pass', 'bg', 'post', 'vec', 'text', 'show', 'gate', 'scale', 'seg', 'lerp3', 'live', 'cues', 'sfx', 'chrome', 'scene', 'mouseStage']) {
    assert.equal(typeof k[fn], 'function', `kit.${fn}`);
  }
  for (const fn of ['fmtInt', 'sup', 'sci', 'durHuman']) assert.equal(typeof k[fn], 'function', `kit.${fn}`);
  for (const p of ['h1', 'h2', 'h3', 'lead', 'quote', 'mono', 'monoS', 'monoL', 'lab', 'num', 'numS', 'act']) assert.ok(k.PRESETS[p], `preset ${p}`);
  assert.ok(k.T.ember === '#ff4a1c' && k.T.M === 140 && k.T.R === 1780);
  const sy = k.scale([2012, 2026], [0, 1400]);
  assert.equal(sy(2012), 0);
  assert.equal(sy(2026), 1400);
  assert.equal(sy.inv(700), 2019);
  const sl = k.scale([1, 1000], [900, 300], true);
  assert.ok(Math.abs(sl(10) - 700) < 1e-9 && Math.abs(sl.inv(500) - 100) < 1e-9);
  assert.equal(k.sup('10'), '¹⁰');
  assert.equal(k.fmtInt(439804651), '439,804,651');
  assert.equal(k.durHuman(240), '4 分钟');
  assert.equal(k.durHuman(3600), '1 小时');
  assert.equal(k.durHuman(86400), '1 天');
  assert.ok(k.durHuman(31557600).includes('年'));
  assert.equal(k.seg({ p: [0.5] }, 0, 0, 1), 0.5);
  assert.equal(k.seg({ p: [0.9] }, 0, 0, 0.5), 1);
});

console.log(`\nResult: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
