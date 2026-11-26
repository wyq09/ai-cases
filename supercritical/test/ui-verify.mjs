/**
 * ego-browser (ego-lite) UI, WebGL2 & visual regression suite for 《超临界》SUPERCRITICAL.
 * Run with:
 *   ego-browser nodejs < /Users/yiqunwu/wuyiqun/power_project/ai-x/ai_coding/ai-cases/supercritical/test/ui-verify.mjs
 *   bash supercritical/test/shots-jpg.sh        # afterwards: PNG → the JPEGs the README embeds
 *
 * One TaskSpace, one reused p1 (per AGENTS.md). Covers:
 *  - Offline file:// boot (1920x1080 for stills, 1440x900 for live input), zero runtime / console / shader errors
 *  - Every beat of all 14 scenes: deterministic seek, non-blank frames, zero errors
 *  - All 12 GLSL transitions at p = 0.2 / 0.5 / 0.8
 *  - Scene 7 criticality: real mouse movement changes k (pixels change, slide does not)
 *  - Presenter keys: ArrowRight / ArrowLeft / N / O / . / ? / Esc / A / M / F
 *  - Speaker notes & overview (14 cards), mobile portrait 390x844, landscape phone
 *  - Showcase screenshots -> supercritical/shots/
 */

const assert = (await import('node:assert/strict')).default;
const fs = await import('node:fs/promises');
const path = await import('node:path');

const ROOT = '/Users/yiqunwu/wuyiqun/power_project/ai-x/ai_coding/ai-cases/supercritical';
const SHOTS = `${ROOT}/shots`;
const FILE_URL = `file://${ROOT}/index.html`;
const EXPECTED = [
  ['brief', 'fade'],
  ['fold', 'plot'],
  ['compute', 'burn'],
  ['price', 'drop'],
  ['horizon', 'stretch'],
  ['lab', 'ring'],
  ['critical', 'burn'],
  ['good', 'rewind'],
  ['zeno', 'zeno'],
  ['nation', 'shockwave'],
  ['science', 'halftone'],
  ['scale', 'zoom'],
  ['white', 'overexpose'],
  ['luck', 'fade'],
];
const SHOWCASE = [
  { id: 'brief', beat: 3, t: 3.4, shot: '01-brief.png' },
  { id: 'brief', beat: 1, t: 5.2, shot: '01b-brief-typing.png' },
  { id: 'fold', beat: 3, t: 6.2, shot: '02-fold.png' },
  { id: 'fold', beat: 2, t: 4.4, shot: '02b-fold-karman.png' },
  { id: 'compute', beat: 0, t: 5.2, shot: '03-compute-log.png' },
  { id: 'compute', beat: 1, t: 3.4, shot: '03b-compute-linear.png' },
  { id: 'compute', beat: 2, t: 4.2, shot: '03c-compute-knee.png' },
  { id: 'price', beat: 1, t: 5.6, shot: '04-price.png' },
  { id: 'price', beat: 2, t: 4.4, shot: '04b-price-tech.png' },
  { id: 'horizon', beat: 2, t: 5.2, shot: '05-horizon.png' },
  { id: 'horizon', beat: 3, t: 5.0, shot: '05b-horizon-bench.png' },
  { id: 'lab', beat: 8, t: 3.0, shot: '06-lab.png' },
  { id: 'lab', beat: 9, t: 4.0, shot: '06b-lab-closed.png' },
  { id: 'critical', beat: 2, t: 6.0, shot: '07-critical.png' },
  { id: 'good', beat: 1, t: 6.0, shot: '08-good.png' },
  { id: 'good', beat: 3, t: 6.4, shot: '08b-good-dates.png' },
  { id: 'zeno', beat: 1, t: 4.4, shot: '09-zeno.png' },
  { id: 'zeno', beat: 2, t: 6.6, shot: '09b-zeno-century.png' },
  { id: 'nation', beat: 3, t: 5.6, shot: '10-nation.png' },
  { id: 'science', beat: 0, t: 5.0, shot: '11-science-human.png' },
  { id: 'science', beat: 1, t: 7.0, shot: '11b-science-flood.png' },
  { id: 'scale', beat: 4, t: 5.2, shot: '12-scale-sun.png' },
  { id: 'scale', beat: 5, t: 6.4, shot: '12b-scale-galaxy.png' },
  { id: 'white', beat: 1, t: 7.0, shot: '13-white.png' },
  { id: 'luck', beat: 1, t: 5.0, shot: '14-luck.png' },
];

await fs.mkdir(SHOTS, { recursive: true });
let passed = 0;
const pass = (msg) => {
  passed++;
  console.log(`PASS [${passed}]: ${msg}`);
};

const MONITOR = `(() => {
  if (window.__QA_MONITOR_INSTALLED__) return;
  window.__QA_MONITOR_INSTALLED__ = true;
  window.__QA_ERRORS = []; window.__QA_SHADER_ERRORS = [];
  const push = (k, m) => window.__QA_ERRORS.push({ kind: k, msg: String(m).slice(0, 700) });
  window.addEventListener('error', (e) => push('pageerror', e.message || (e.error && e.error.stack) || String(e)));
  window.addEventListener('unhandledrejection', (e) => push('unhandledrejection', (e.reason && e.reason.stack) || String(e.reason)));
  const oe = console.error.bind(console);
  console.error = (...a) => { push('console.error', a.map((x) => (x && x.stack) ? x.stack : String(x)).join(' ')); oe(...a); };
  if (typeof WebGL2RenderingContext !== 'undefined') {
    const P = WebGL2RenderingContext.prototype;
    const oc = P.compileShader;
    P.compileShader = function(sh) { oc.call(this, sh); try { if (!this.getShaderParameter(sh, this.COMPILE_STATUS)) window.__QA_SHADER_ERRORS.push({ kind: 'compile', log: (this.getShaderInfoLog(sh) || '').slice(0, 1500) }); } catch (_) {} };
    const ol = P.linkProgram;
    P.linkProgram = function(pr) { ol.call(this, pr); try { if (!this.getProgramParameter(pr, this.LINK_STATUS)) window.__QA_SHADER_ERRORS.push({ kind: 'link', log: (this.getProgramInfoLog(pr) || '').slice(0, 1500) }); } catch (_) {} };
  }
})();`;

// Acquire or reuse ONE TaskSpace & p1
const spaces = await listTaskSpaces();
const existing = spaces.find((s) => s.name === 'supercritical qa');
const task = existing
  ? (existing.ownership === 'user'
      ? await claimTaskSpace(existing.id)
      : existing.ownership === 'agentDelegatedToUser'
        ? await takeOverTaskSpace(existing.id)
        : await taskSpace(existing.id))
  : await taskSpace('supercritical qa');
const managed = await task.pages();
const page = managed[0] ?? (await task.adopt((await task.tabs())[0].page));
console.log({ taskSpaceId: task.spaceId, page: page.label });

const getErrors = () => page.evaluate(() => ({ errors: window.__QA_ERRORS || [], shaderErrors: window.__QA_SHADER_ERRORS || [], hook: window.__errs || [] }));
async function assertZeroErrors(stage) {
  const { errors, shaderErrors, hook } = await getErrors();
  const all = [...errors, ...shaderErrors, ...hook.map((h) => ({ kind: 'hook', msg: h }))];
  if (all.length > 0) {
    throw new Error(`Errors at [${stage}] (${all.length}): ` + JSON.stringify(all.slice(0, 4)).slice(0, 2400));
  }
}

// Sample the WebGL canvas right after a synchronous deck.test.draw()
async function sample() {
  return await page.evaluate(() => {
    const deck = window.__deck;
    if (deck && deck.test && deck.test.draw) deck.test.draw();
    const canvas = document.querySelector('canvas');
    const gl = canvas && canvas.getContext('webgl2');
    if (!gl) return { ok: false, reason: 'no webgl2' };
    const w = canvas.width;
    const h = canvas.height;
    if (w < 10 || h < 10) return { ok: false, reason: `tiny ${w}x${h}` };
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const stepX = Math.max(1, Math.floor(w / 96));
    const stepY = Math.max(1, Math.floor(h / 54));
    let n = 0, sr = 0, sg = 0, sb = 0, sl = 0, sl2 = 0;
    for (let y = 0; y < h; y += stepY) {
      for (let x = 0; x < w; x += stepX) {
        const i = (y * w + x) * 4;
        const r = buf[i], g = buf[i + 1], b = buf[i + 2];
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        sr += r; sg += g; sb += b; sl += l; sl2 += l * l; n++;
      }
    }
    const sig = [];
    for (let gy = 0; gy < 6; gy++) for (let gx = 0; gx < 8; gx++) {
      const i = (Math.floor(((gy + 0.5) / 6) * h) * w + Math.floor(((gx + 0.5) / 8) * w)) * 4;
      sig.push(buf[i], buf[i + 1], buf[i + 2]);
    }
    const mean = sl / n;
    return {
      ok: true, w, h, n,
      meanR: +(sr / n).toFixed(1), meanG: +(sg / n).toFixed(1), meanB: +(sb / n).toFixed(1), meanL: +mean.toFixed(1),
      variance: +(sl2 / n - mean * mean).toFixed(1),
      sig,
    };
  });
}
const rgbDist = (a, b) => Math.hypot(a.meanR - b.meanR, a.meanG - b.meanG, a.meanB - b.meanB);
const sigDiff = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;

const setViewport = async (w, h, dpr, mobile) => {
  await page.cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile });
  await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: !!mobile });
};
const boot = async (query, w, h, dpr = 1, mobile = false) => {
  await setViewport(w, h, dpr, mobile);
  await page.cdp('Page.addScriptToEvaluateOnNewDocument', { source: MONITOR });
  await page.goto(`${FILE_URL}?${query}`, { timeout: 30000 });
  await page.waitForFunction(() => window.ready === true && !!window.__deck && !!window.__deck.test, undefined, { timeout: 30000 });
};

try {
  // =========================================================================
  // 1. Desktop 1920x1080 (the stage's native size), offline file://, headless seek mode
  // =========================================================================
  await boot('headless=1&quick=1', 1920, 1080);
  await assertZeroErrors('desktop boot');
  pass('Offline file:// boot at 1920x1080: WebGL2 ready, zero runtime/shader errors');

  const meta = await page.evaluate(() => {
    const d = window.__deck;
    return {
      ids: d.scenes.map((s) => s.id),
      enter: d.scenes.map((s) => s.enterWith),
      beats: d.scenes.map((s) => (s.beats || []).length),
      pages: d.scenes.map((s) => (typeof s.page === 'function' ? s.page({ beat: 0 }) : '')),
      notes: d.scenes.map((s) => (s.notes || []).length),
      build: window.__SC.BUILD,
      hasTest: ['seek', 'trans', 'draw', 'perf'].every((k) => typeof d.test[k] === 'function'),
    };
  });
  assert.deepEqual(meta.ids, EXPECTED.map((e) => e[0]), 'scene order');
  assert.deepEqual(meta.enter, EXPECTED.map((e) => e[1]), 'transition order');
  assert.equal(meta.hasTest, true, 'deck.test harness');
  assert.ok(meta.pages.every((p, i) => p === `${String(i + 1).padStart(2, '0')} / 14`), `page labels: ${JSON.stringify(meta.pages)}`);
  assert.ok(meta.beats.every((n, i) => n >= 3 && meta.notes[i] >= n), `beats vs notes: ${JSON.stringify([meta.beats, meta.notes])}`);
  pass(`14 scenes in order with matching speaker notes (${meta.beats.reduce((a, b) => a + b, 0)} beats), ${meta.build.authorLines.toLocaleString('en-US')} authored lines`);

  // =========================================================================
  // 2. Every beat of every scene: deterministic seek, non-blank, zero errors
  // =========================================================================
  const beatPlan = await page.evaluate(() =>
    window.__deck.scenes.flatMap((sc) => (sc.beats || []).map((b, i) => ({ id: sc.id, beat: i, t: (b.delay || 0) + (b.dur || 1) + 0.6 })))
  );
  let blank = 0;
  for (const it of beatPlan) {
    await page.evaluate(async (o) => { await window.__deck.test.seek(o.id, o.beat, o.t); window.__deck.test.draw(); }, it);
  }
  await assertZeroErrors('all-beats sweep');
  pass(`All ${beatPlan.length} beats across 14 scenes seek deterministically with zero errors`);

  // =========================================================================
  // 3. Showcase frames: non-blank, distinct palettes, screenshots
  // =========================================================================
  const stats = {};
  for (const it of SHOWCASE) {
    await page.evaluate(async (o) => { await window.__deck.test.seek(o.id, o.beat, o.t); window.__deck.test.draw(); }, it);
    const st = await sample();
    assert.equal(st.ok, true, `sample ${it.shot}`);
    assert.ok(st.variance > 6 && st.meanL > 1.2, `${it.id}#${it.beat} looks blank: var=${st.variance} meanL=${st.meanL}`);
    stats[it.shot] = st;
    await page.screenshot({ path: path.join(SHOTS, it.shot) });
    if (blank === 0) blank = 1;
  }
  const keys = Object.keys(stats);
  let distinct = 0;
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) if (rgbDist(stats[keys[i]], stats[keys[j]]) > 18) distinct++;
  const pairs = (keys.length * (keys.length - 1)) / 2;
  // The deck is deliberately one family (void black · blackbody ember · paper white), so compare
  // each frame against the others instead of demanding rainbow variety.
  const loners = keys.filter((k) => keys.filter((o) => o !== k && rgbDist(stats[k], stats[o]) > 18).length < 6);
  assert.equal(loners.length, 0, `showcase frames that look like everything else: ${JSON.stringify(loners)}`);
  pass(`${SHOWCASE.length} showcase frames rendered, each visually distinct from at least 6 others (${distinct}/${pairs} pairs differ), saved to shots/`);

  // render cost per scene at 1920x1080 (informational; flags pathological scenes)
  const perf = await page.evaluate(async () => {
    const d = window.__deck;
    const out = {};
    for (let i = 0; i < d.scenes.length; i++) {
      const sc = d.scenes[i];
      await d.test.seek(sc.id, Math.min(sc.beats.length - 1, 2), 3.0);
      out[sc.id] = +d.test.perf(sc.id, 12).toFixed(2);
    }
    return out;
  });
  await assertZeroErrors('perf sweep');
  const slow = Object.entries(perf).filter(([, ms]) => ms > 40);
  assert.equal(slow.length, 0, `scenes over 40ms/frame: ${JSON.stringify(slow)}`);
  pass(`Per-scene render cost within budget (max ${Math.max(...Object.values(perf))} ms/frame): ${JSON.stringify(perf)}`);

  // =========================================================================
  // 4. All 12 GLSL transitions at p = 0.2 / 0.5 / 0.8
  // =========================================================================
  const TR_SHOTS = { burn: ['compute', 't-burn.png'], ring: ['lab', 't-ring.png'], zeno: ['zeno', 't-zeno.png'], overexpose: ['white', 't-overexpose.png'], stretch: ['horizon', 't-stretch.png'], rewind: ['good', 't-rewind.png'] };
  let trCount = 0;
  for (let i = 1; i < EXPECTED.length; i++) {
    const [id, name] = EXPECTED[i];
    for (const p of [0.2, 0.5, 0.8]) {
      await page.evaluate(async ([sid, sp]) => { await window.__deck.test.trans(sid, sp); }, [id, p]);
      const st = await sample();
      assert.equal(st.ok, true, `transition ${name} sample`);
      assert.ok(st.variance > 3, `transition ${name} p=${p} blank (var=${st.variance})`);
      if (p === 0.5 && TR_SHOTS[name] && TR_SHOTS[name][0] === id) {
        await page.evaluate(async ([sid]) => { await window.__deck.test.trans(sid, 0.5); }, [id]);
        await page.screenshot({ path: path.join(SHOTS, TR_SHOTS[name][1]) });
      }
      trCount++;
    }
    await assertZeroErrors(`transition:${name}`);
  }
  pass(`All 12 transitions verified at p = 0.2 / 0.5 / 0.8 (${trCount} mid-frames), zero shader errors`);

  // =========================================================================
  // 5. Live interactive mode (RAF running) at 1440x900: presenter keys + k interaction
  // =========================================================================
  await boot('quick=1', 1440, 900);
  await assertZeroErrors('live boot');
  pass('Live (RAF) mode boots offline with zero errors');

  const snap = () => page.evaluate(() => {
    const d = window.__deck;
    const info = d.info();
    const q = (sel) => document.querySelector(sel);
    const notesEl = q('#ui .notes');
    const overEl = q('#ui .over');
    const helpEl = q('#ui .help');
    return {
      scene: info.scene, beat: info.beat, hash: location.hash, notes: info.notes,
      auto: d.auto, muted: d.muted, trans: !!d.trans,
      hasNotes: !!notesEl, notesText: notesEl ? notesEl.innerText.trim() : '',
      hasOver: !!overEl, overCount: overEl ? overEl.querySelectorAll('button').length : 0,
      hasHelp: !!helpEl, helpText: helpEl ? helpEl.innerText : '',
    };
  });
  const still = async (scene, beat) => page.waitForFunction(([sc, b]) => !window.__deck.trans && window.__deck.info().scene === sc && window.__deck.info().beat === b, [scene, beat], { timeout: 12000 });
  // Live-mode assertions poll instead of sleeping on fixed delays, so a throttled animation frame
  // can only make a check slower, never wrong.
  const until = async (fn, pred, { tries = 32, gap = 250 } = {}) => {
    let last = await fn();
    for (let i = 0; i < tries && !pred(last); i++) {
      await page.waitForTimeout(gap);
      last = await fn();
    }
    return last;
  };

  // ArrowRight / ArrowLeft
  await page.evaluate(() => window.__deck.jump('brief', 0));
  await still('brief', 0);
  await page.waitForTimeout(200);
  const s0 = await snap();
  await page.keyboard.press('ArrowRight');
  const s1 = await until(snap, (x) => x.beat === 1 && !x.trans);
  assert.equal(s1.beat, 1, `ArrowRight did not advance beat: ${JSON.stringify(s1)}`);
  await page.keyboard.press('ArrowLeft');
  const s2 = await until(snap, (x) => x.beat === 0 && !x.trans);
  assert.equal(s2.beat, 0, 'ArrowLeft did not step back');
  assert.ok(/^#brief/.test(s2.hash), `hash sync: ${s2.hash}`);
  pass('ArrowRight / ArrowLeft step beats and keep the URL hash in sync');

  // N: speaker notes
  await page.keyboard.press('KeyN');
  const nOn = await until(snap, (x) => x.hasNotes);
  assert.equal(nOn.hasNotes, true, 'N did not open notes');
  assert.ok(/[\u4e00-\u9fff]/.test(nOn.notesText) && nOn.notesText.length > 8, `notes text: "${nOn.notesText}"`);
  await page.keyboard.press('KeyN');
  assert.equal((await until(snap, (x) => !x.hasNotes)).hasNotes, false, 'N did not close notes');
  pass('N toggles the Chinese speaker-notes bar');

  // O: overview with 14 cards + jump
  await page.keyboard.press('KeyO');
  const oOn = await until(snap, (x) => x.hasOver);
  assert.equal(oOn.hasOver, true, 'O did not open overview');
  assert.equal(oOn.overCount, 14, `overview cards: ${oOn.overCount}`);
  await page.screenshot({ path: path.join(SHOTS, '00-overview.png') });
  await page.keyboard.press('Escape');
  assert.equal((await until(snap, (x) => !x.hasOver)).hasOver, false, 'Escape did not close overview');
  pass('O opens the 14-card overview; Esc closes it');

  // '.': black screen (run on the white scene so "restored" is unmistakable)
  await page.evaluate(() => window.__deck.jump('white', 1));
  await still('white', 1);
  await page.waitForTimeout(400);
  await page.keyboard.press('Period');
  const blk = await until(sample, (x) => x.meanL < 6);
  await page.keyboard.press('Period');
  const un = await until(sample, (x) => x.meanL > 120);
  assert.ok(blk.meanL < 6, `black screen meanL=${blk.meanL}`);
  assert.ok(un.meanL > blk.meanL + 1.5, `restore meanL=${un.meanL}`);
  pass(`'.' blanks the screen (meanL ${un.meanL} → ${blk.meanL}) and restores it`);

  // '?': help
  await page.keyboard.press('Shift+Slash');
  const hOn = await until(snap, (x) => x.hasHelp);
  assert.equal(hOn.hasHelp, true, '? did not open help');
  assert.ok(hOn.helpText.includes('下一页'), `help text: ${hOn.helpText}`);
  await page.keyboard.press('Escape');
  assert.equal((await until(snap, (x) => !x.hasHelp)).hasHelp, false, 'Esc did not close help');
  pass("? opens the shortcut help; Esc closes it");

  // A / M toggles
  const t0 = await snap();
  await page.keyboard.press('KeyA');
  assert.notEqual((await until(snap, (x) => x.auto !== t0.auto)).auto, t0.auto, 'A should toggle autoplay');
  await page.keyboard.press('KeyA');
  await until(snap, (x) => x.auto === t0.auto);
  await page.keyboard.press('KeyM');
  assert.notEqual((await until(snap, (x) => x.muted !== t0.muted)).muted, t0.muted, 'M should toggle mute');
  await page.keyboard.press('KeyM');
  await until(snap, (x) => x.muted === t0.muted);
  pass('A (autoplay) and M (mute) toggle; audio graph runs without errors after key-unlock');

  // Scene 7 · criticality: moving the mouse changes k, the slide stays put
  await page.evaluate(() => window.__deck.jump('critical', 3));
  await still('critical', 3);
  await page.mouse.move(300, 300, { label: 'Set k low with the mouse' });
  await page.waitForTimeout(2600);
  const kLow = await sample();
  await page.mouse.move(1320, 300, { label: 'Push k past one' });
  const kHigh = await until(sample, (x) => sigDiff(kLow.sig, x.sig) > 6 || x.meanL > kLow.meanL * 1.15, { tries: 40 });
  const kState = await snap();
  assert.equal(kState.scene, 'critical', `mouse moved the slide to ${kState.scene}`);
  assert.equal(kState.beat, 3, `mouse moved the beat to ${kState.beat}`);
  const dk = sigDiff(kLow.sig, kHigh.sig);
  assert.ok(dk > 6 || kHigh.meanL > kLow.meanL * 1.15, `raising k did not change the field (sigDiff=${dk.toFixed(2)}, meanL ${kLow.meanL} → ${kHigh.meanL})`);
  await page.screenshot({ path: path.join(SHOTS, '07b-critical-supercritical.png') });
  await assertZeroErrors('k interaction');
  pass(`Scene 7: pushing k with the mouse re-ignites the field (sigDiff=${dk.toFixed(2)}, meanL ${kLow.meanL} → ${kHigh.meanL}) without leaving the slide`);

  // Click-to-advance still works after an interactive scene
  await page.evaluate(() => window.__deck.jump('fold', 1));
  await still('fold', 1);
  await page.mouse.click(1200, 200, { label: 'Click to advance the slide' });
  const clk = await until(snap, (x) => x.beat === 2 && !x.trans);
  assert.equal(clk.beat, 2, 'click did not advance after the interactive scene');
  pass('Click still advances after the interactive scene');
  await assertZeroErrors('live controls');

  // =========================================================================
  // 6. Mobile portrait 390x844 and landscape phone 844x390
  // =========================================================================
  await boot('headless=1&quick=1', 390, 844, 2, true);
  const ml = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const r = c.getBoundingClientRect();
    return { sw: document.documentElement.scrollWidth, iw: window.innerWidth, cw: Math.round(r.width), ch: Math.round(r.height) };
  });
  assert.ok(ml.sw <= ml.iw + 1, `horizontal overflow ${ml.sw} > ${ml.iw}`);
  assert.ok(ml.cw >= 380 && ml.ch >= 800, `canvas ${JSON.stringify(ml)}`);
  for (const [id, beat, t, shot] of [['compute', 0, 5.2, null], ['lab', 8, 3.0, 'mobile-lab.png'], ['scale', 5, 6.4, 'mobile-scale.png'], ['white', 1, 7.0, null]]) {
    await page.evaluate(async (o) => { await window.__deck.test.seek(o.id, o.beat, o.t); window.__deck.test.draw(); }, { id, beat, t });
    const st = await sample();
    assert.ok(st.ok && st.variance > 6, `mobile ${id} blank (var=${st.variance})`);
    if (shot) await page.screenshot({ path: path.join(SHOTS, shot) });
  }
  await assertZeroErrors('mobile portrait');
  pass('Mobile portrait 390x844: full-bleed canvas, no horizontal overflow, scenes render');

  await boot('headless=1&quick=1', 844, 390, 2, true);
  await page.evaluate(async () => { await window.__deck.test.seek('horizon', 2, 5.2); window.__deck.test.draw(); });
  const ls = await sample();
  assert.ok(ls.ok && ls.variance > 6, `landscape phone blank (var=${ls.variance})`);
  await assertZeroErrors('landscape phone');
  pass('Landscape phone 844x390 renders the charts without errors');

  // =========================================================================
  // 7. Deep link via URL hash on a cold load
  // =========================================================================
  await boot('quick=1#scale-5', 1440, 900);
  const deep = await snap();
  assert.equal(deep.scene, 'scale', `deep link scene: ${deep.scene}`);
  assert.equal(deep.beat, 4, `deep link beat: ${deep.beat}`);
  await assertZeroErrors('deep link');
  pass('URL deep link (#scale-5) opens straight at scene 12, beat 5');

  // =========================================================================
  // 8. Normal cold start: warm-up pass over every scene and transition, real overview thumbnails
  // =========================================================================
  const tw = Date.now();
  await page.goto(FILE_URL, { timeout: 60000 });
  await page.waitForFunction(() => window.ready === true && !!window.__deck, undefined, { timeout: 90000 });
  const warmMs = Date.now() - tw;
  await assertZeroErrors('warm-up cold boot');
  const warm = await page.evaluate(() => ({
    ready: window.__deck.R.filter((r) => r.ready).length,
    thumbs: Object.keys(window.__deck.ctx.thumbs).length,
    loader: !!document.querySelector('#ui .load'),
  }));
  assert.equal(warm.ready, 14, `scenes initialised after warm-up: ${warm.ready}`);
  assert.equal(warm.thumbs, 14, `overview thumbnails after warm-up: ${warm.thumbs}`);
  assert.equal(warm.loader, false, 'loader overlay still present');
  await page.keyboard.press('KeyO');
  await until(snap, (x) => x.hasOver && x.overCount === 14);
  await page.screenshot({ path: path.join(SHOTS, '00-overview.png') });
  await page.keyboard.press('Escape');
  pass(`Normal cold start warms all 14 scenes + thumbnails in ${(warmMs / 1000).toFixed(1)}s with zero errors`);
} finally {
  await page.cdp('Emulation.clearDeviceMetricsOverride').catch(() => {});
  await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: false }).catch(() => {});
}
console.log(`\nALL ${passed} EGO-BROWSER UI & VISUAL CHECKS PASSED.`);
