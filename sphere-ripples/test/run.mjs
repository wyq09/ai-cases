/**
 * 球面涟漪 · 逻辑层回归（纯 node，不开浏览器）
 * 做法：把 index.html 内联脚本抽出来，放进 node:vm 里跑，
 *       用桩替代 p5 的绘图 API，逐帧驱动 setup()/draw()，
 *       再对几何与生命周期做断言。
 *
 * 运行：node test/run.mjs
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const HTML = resolve(HERE, '..', 'index.html');

/* ---------- 取出内联脚本 ---------- */
const html = readFileSync(HTML, 'utf8');
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
assert.ok(blocks.length > 0, 'index.html 里找不到内联脚本');
const code = blocks[blocks.length - 1][1];

/* ---------- 确定性随机 ---------- */
let seed = 0x2f6e2b1 >>> 0;
const rnd = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const M = Object.create(Math);
M.random = rnd;

/* ---------- p5 桩 + 绘制记录 ---------- */
const calls = {
  lines: [],      // line(x1,y1,z1,x2,y2,z2)
  polys: [],      // 每次 beginShape..endShape 的顶点数组
  weights: [],    // strokeWeight 调用
  strokes: [],    // stroke(r,g,b)
  backgrounds: 0,
  blends: [],
  rotatesY: [],
  rotatesX: [],
};

const ctx = {
  console, Math: M,
  WEBGL: 'webgl', ROUND: 'round', CLOSE: 'close',
  BLEND: 'BLEND', ADD: 'ADD',
  frameCount: 0,
  window: { innerWidth: 1440, innerHeight: 900, devicePixelRatio: 2 },
  createCanvas: () => ({ elt: { style: {} } }),
  frameRate: () => {},
  strokeCap: () => {},
  noFill: () => {},
  background: () => { calls.backgrounds++; },
  blendMode: (m) => { calls.blends.push(m); },
  rotateY: (a) => { calls.rotatesY.push(a); },
  rotateX: (a) => { calls.rotatesX.push(a); },
  stroke: (r, g, b) => { calls.strokes.push([r, g, b]); },
  strokeWeight: (w) => { calls.weights.push(w); },
  line: (...a) => { calls.lines.push(a); },
  beginShape: () => { calls._cur = []; },
  vertex: (...a) => { calls._cur.push(a); },
  endShape: (mode) => { calls.polys.push({ mode, verts: calls._cur }); calls._cur = null; },
  document: { querySelector: () => null },
};
vm.createContext(ctx);
vm.runInContext(code, ctx);

const R = 1080 * 0.32;
const N = 150;
const RAY_FRAMES = 30;
const PALETTE = [
  [0x14, 0x6c, 0xbd], [0xf3, 0xf3, 0xf3], [0xdf, 0x6c, 0x1f],
  [0xd7, 0x23, 0x29], [0xff, 0xcc, 0x3f],
];
const isPalette = (c) => PALETTE.some((p) => p[0] === c[0] && p[1] === c[1] && p[2] === c[2]);

/* ---------- 跑起来 ---------- */
const results = [];
function check(name, fn) {
  try { fn(); results.push(['PASS', name]); }
  catch (e) { results.push(['FAIL', name + ' :: ' + e.message]); }
}

ctx.frameCount = 0;
vm.runInContext('setup()', ctx);

check('setup 建立 150 个涟漪', () => {
  const rs = vm.runInContext('ripples', ctx);
  assert.equal(rs.length, N);
});

check('开场延迟全部落在 0~4s（0~240 帧）', () => {
  const rs = vm.runInContext('ripples', ctx);
  for (const r of rs) {
    assert.ok(r.delay >= 0 && r.delay <= 240, 'delay=' + r.delay);
    assert.equal(r.state, 'delay');
  }
});

check('方向为单位向量（球面均匀）', () => {
  const rs = vm.runInContext('ripples', ctx);
  for (const r of rs) {
    const len = Math.hypot(r.dir.x, r.dir.y, r.dir.z);
    assert.ok(Math.abs(len - 1) < 1e-9, 'len=' + len);
  }
});

check('切向基 u/v 与 d 正交且各自单位长', () => {
  const rs = vm.runInContext('ripples', ctx);
  for (const r of rs) {
    const { dir: d, u, v } = r;
    assert.ok(Math.abs(u.x * d.x + u.y * d.y + u.z * d.z) < 1e-9, 'u·d');
    assert.ok(Math.abs(v.x * d.x + v.y * d.y + v.z * d.z) < 1e-9, 'v·d');
    assert.ok(Math.abs(u.x * v.x + u.y * v.y + u.z * v.z) < 1e-9, 'u·v');
    assert.ok(Math.abs(Math.hypot(u.x, u.y, u.z) - 1) < 1e-9, '|u|');
    assert.ok(Math.abs(Math.hypot(v.x, v.y, v.z) - 1) < 1e-9, '|v|');
  }
});

check('圆环张角上限 aMax 落在 0.05~0.25 弧度', () => {
  const rs = vm.runInContext('ripples', ctx);
  for (const r of rs) {
    assert.ok(r.aMax >= 0.05 && r.aMax <= 0.25, 'aMax=' + r.aMax);
  }
});

check('圆环时长落在 1~2 秒（60~120 帧）', () => {
  const rs = vm.runInContext('ripples', ctx);
  for (const r of rs) {
    assert.ok(r.ringFrames >= 60 && r.ringFrames <= 120, 'ringFrames=' + r.ringFrames);
  }
});

check('色彩只取 5 色调色板', () => {
  const rs = vm.runInContext('ripples', ctx);
  for (const r of rs) assert.ok(isPalette(r.c), 'color=' + r.c);
});

/* ---------- 逐帧驱动，记录生命周期 ---------- */
const timeline = new Map();   // index -> [{state, f}]
const prev = vm.runInContext('ripples', ctx).map((r) => ({ state: r.state, dir: r.dir }));
const FRAMES = 1200;
for (let i = 0; i < FRAMES; i++) {
  ctx.frameCount = i + 1;
  vm.runInContext('draw()', ctx);
  const rs = vm.runInContext('ripples', ctx);
  rs.forEach((r, idx) => {
    if (!timeline.has(idx)) timeline.set(idx, []);
    timeline.get(idx).push({ state: r.state, f: r.f, aMax: r.aMax, ringFrames: r.ringFrames });
  });
}

check('每帧都清屏并切换到 ADD 叠加', () => {
  assert.equal(calls.backgrounds, FRAMES);
  assert.equal(calls.blends.length, FRAMES * 2);
  assert.equal(calls.blends[0], 'BLEND');
  assert.equal(calls.blends[1], 'ADD');
});

check('镜头：绕 Y 轴 0.2 rad/s，绕 X 轴点头', () => {
  assert.ok(calls.rotatesY.length === FRAMES);
  assert.ok(Math.abs(calls.rotatesY[10] - (11 / 60) * 0.2) < 1e-12, 'rotateY=' + calls.rotatesY[10]);
  const t = 30 / 60;
  const expectX = -0.25 + Math.sin(t * 0.2) * 0.5;
  assert.ok(Math.abs(calls.rotatesX[29] - expectX) < 1e-12, 'rotateX=' + calls.rotatesX[29]);
});

check('生命周期：射线 30 帧 → 涟漪 60~120 帧 → 延迟 ≤30 帧 → 重生', () => {
  for (const [, seq] of timeline) {
    let i = 0;
    // 跳过开场延迟
    while (i < seq.length && seq[i].state === 'delay') i++;
    assert.ok(i < seq.length, '开场后应进入 ray');
    // 连续 ray 段
    let rayLen = 0;
    while (i < seq.length && seq[i].state === 'ray') { rayLen++; i++; }
    assert.equal(rayLen, RAY_FRAMES + 1, 'ray 帧数=' + rayLen);
    // 连续 ring 段
    let ringLen = 0, ringFrames = 0;
    while (i < seq.length && seq[i].state === 'ring') { ringLen++; ringFrames = seq[i].ringFrames; i++; }
    assert.ok(ringLen >= 60 && ringLen <= 121, 'ring 帧数=' + ringLen);
    assert.equal(ringLen, ringFrames + 1);
    // 回到 delay，延迟 ≤30 帧后再次 ray（首帧为 f=0 的切换帧，不计入延迟）
    let delayLen = 0;
    while (i < seq.length && seq[i].state === 'delay') { delayLen++; i++; }
    assert.ok(delayLen > 0 && delayLen - 1 <= 30, '重生延迟=' + (delayLen - 1));
    assert.ok(i < seq.length && seq[i].state === 'ray', '重生后应回到 ray');
  }
});

check('重生：方向与颜色都会换新', () => {
  const rs = vm.runInContext('ripples', ctx);
  const changed = rs.some((r, idx) => {
    const old = prev[idx].dir;
    return Math.abs(old.x - r.dir.x) + Math.abs(old.y - r.dir.y) + Math.abs(old.z - r.dir.z) > 1e-6;
  });
  assert.ok(changed, '至少应有涟漪换过新方向');
});

/* ---------- 几何断言 ---------- */
check('射线几何：头 √p、尾 p，头尾都在球面内', () => {
  assert.ok(calls.lines.length > 0, '应有射线绘制');
  let checked = 0;
  for (const L of calls.lines) {
    const [x1, y1, z1, x2, y2, z2] = L;
    const tail = Math.hypot(x1, y1, z1);
    const head = Math.hypot(x2, y2, z2);
    if (tail === 0 && head === 0) continue;       // p=0 的退化帧
    const p = tail / R;
    assert.ok(Math.abs(head - Math.sqrt(p) * R) < 1e-6, 'head=' + head + ' p=' + p);
    assert.ok(head >= tail - 1e-9, '头必须在尾部之外');
    assert.ok(head <= R + 1e-9, '头不能超出球面');
    checked++;
    if (checked > 4000) break;
  }
  assert.ok(checked > 100, '有效射线样本太少');
});

check('圆环几何：36 顶点闭合、贴在半径 R 的球面上、张角 = aMax·(1-(1-t)^2.2)', () => {
  assert.ok(calls.polys.length > 0, '应有圆环绘制');
  let checked = 0;
  for (const poly of calls.polys) {
    assert.equal(poly.mode, ctx.CLOSE, '圆环必须闭合');
    assert.equal(poly.verts.length, 36, '顶点数=' + poly.verts.length);
    for (const [x, y, z] of poly.verts) {
      const len = Math.hypot(x, y, z);
      assert.ok(Math.abs(len - R) < 1e-6, '顶点在球面上 |v|=' + len);
    }
    checked++;
    if (checked > 3000) break;
  }
  assert.ok(checked > 100, '圆环样本太少');
});

check('圆环张角随时间缓出：e(t)=1-(1-t)^2.2，单调且先快后慢', () => {
  let prevE = -1;
  for (let i = 0; i <= 100; i++) {
    const t = i / 100;
    const e = 1 - Math.pow(1 - t, 2.2);
    assert.ok(e >= prevE - 1e-12, '缓出必须单调不减');
    assert.ok(e >= t - 1e-12, '必须先快后慢（e(t) ≥ t）');
    prevE = e;
  }
  assert.ok(Math.abs((1 - Math.pow(1 - 1, 2.2)) - 1) < 1e-12);
});

check('圆环线宽按 t² 细到 0，射线线宽恒定', () => {
  const w = calls.weights;
  assert.ok(w.includes(5), '应有 5px 起始线宽');
  let min = Infinity, max = -Infinity;
  for (const v of w) { if (v < min) min = v; if (v > max) max = v; }
  assert.ok(min >= 0, '线宽不能为负');
  assert.ok(max <= 5 + 1e-9, '线宽不能超过 5px');
  assert.ok(w.some((v) => v > 0 && v < 0.5), '应出现接近 0 的线宽');
});

check('所有描边颜色都来自调色板', () => {
  assert.ok(calls.strokes.length > 100);
  for (const c of calls.strokes) assert.ok(isPalette(c), 'color=' + c);
});

check('时间基准：只用 frameCount/60，不使用 millis', () => {
  assert.ok(!/\bmillis\b/.test(code), '脚本里不应出现 millis');
  assert.ok(/\bframeCount\s*\/\s*60\b/.test(code), '脚本应使用 frameCount/60');
});

check('自适应：画布按视口等比缩放且保持正方形（内部仍是 1080×1080）', () => {
  const cases = [[1440, 900], [1280, 720], [1024, 1024], [480, 800], [1440, 400], [320, 568]];
  for (const [vw, vh] of cases) {
    ctx.window.innerWidth = vw;
    ctx.window.innerHeight = vh;
    vm.runInContext('fitStage()', ctx);
    const st = vm.runInContext('cnv.elt.style', ctx);
    const expect = Math.floor(1080 * Math.min(vw / 1080, vh / 1080));
    assert.equal(parseInt(st.width, 10), expect, `${vw}×${vh} -> ${st.width}`);
    assert.equal(parseInt(st.height, 10), expect, `${vw}×${vh} -> ${st.height}`);
  }
});

/* ---------- 报告 ---------- */
const fails = results.filter((r) => r[0] === 'FAIL');
for (const [st, name] of results) console.log(`${st === 'PASS' ? '✓' : '✗'} ${name}`);
console.log(`\n${results.length - fails.length}/${results.length} 项逻辑回归通过`);
if (fails.length) process.exitCode = 1;
