/**
 * Automated ego-browser (ego-lite) UI, WebGL2 & visual regression suite for 《最后半个像素》.
 * Run with:
 *   ego-browser nodejs < /Users/yiqunwu/wuyiqun/power_project/ai-x/ai_coding/ai-cases/last-half-pixel/test/ui-verify.mjs
 *
 * Covers:
 *  - Local HTTP serving + offline file:// verification (reusing one TaskSpace & p1)
 *  - Zero console.error / pageerror / WebGL2 shader compile or program link errors
 *  - Deterministic seek across all 10 scenes & beats: non-blank pixel variance + distinct palettes
 *  - Mid-point rendering of all 10 physical GLSL transitions (deck.test.trans(id, 0.5))
 *  - Interactive split-screen divider drag on Scene 8 (split): pixels change, does NOT advance slide
 *  - Keyboard presenter controls: ArrowRight, ArrowLeft, N, O, ., ?, A, M
 *  - Desktop (1440x900) and Mobile portrait (390x844) layout checks
 *  - Saves showcase screenshots to last-half-pixel/shots/ (and key shots to artifact dir if present)
 */

const assert = (await import('node:assert/strict')).default;
const fs = await import('node:fs/promises');
const path = await import('node:path');
const http = await import('node:http');

const ROOT = '/Users/yiqunwu/wuyiqun/power_project/ai-x/ai_coding/ai-cases/last-half-pixel';
const INDEX_PATH = `${ROOT}/index.html`;
const SHOTS_DIR = `${ROOT}/shots`;
const ARTIFACT_DIR = '/Users/yiqunwu/.gemini/antigravity/brain/4f36c2b5-89b1-4f36-be8b-eabc4f41f5e6';
const FILE_URL = `file://${INDEX_PATH}`;

await fs.mkdir(SHOTS_DIR, { recursive: true });
await fs.mkdir(ARTIFACT_DIR, { recursive: true });

let passed = 0;
function pass(msg) {
  passed++;
  console.log(`PASS [${passed}]: ${msg}`);
}

// Start ephemeral local HTTP server for ROOT
const htmlBuf = await fs.readFile(INDEX_PATH);
const server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];
  if (urlPath === '/' || urlPath === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(htmlBuf);
    return;
  }
  res.writeHead(404);
  res.end('Not Found');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const HTTP_URL = `http://127.0.0.1:${port}/index.html`;
console.log(`Local HTTP server listening at ${HTTP_URL}`);

// Acquire or reuse ONE TaskSpace & p1
const spaces = await listTaskSpaces();
const existing = spaces.find((s) => s.name === 'last-half-pixel qa');
const task = existing
  ? (existing.ownership === 'user'
      ? await claimTaskSpace(existing.id)
      : existing.ownership === 'agentDelegatedToUser'
        ? await takeOverTaskSpace(existing.id)
        : await taskSpace(existing.id))
  : await taskSpace('last-half-pixel qa');

const managed = await task.pages();
const page = managed[0] ?? (await task.adopt((await task.tabs())[0].page));
console.log({ taskSpaceId: task.spaceId, page: page.label });

// Inject error & WebGL shader compile/link monitor before document scripts run
const MONITOR_SCRIPT = `
(() => {
  if (window.__QA_MONITOR_INSTALLED__) return;
  window.__QA_MONITOR_INSTALLED__ = true;
  window.__QA_ERRORS = [];
  window.__QA_SHADER_ERRORS = [];

  const pushErr = (kind, msg) => {
    window.__QA_ERRORS.push({ kind, msg: String(msg).slice(0, 600) });
  };

  window.addEventListener('error', (e) => {
    pushErr('pageerror', e.message || (e.error && e.error.stack) || String(e));
  });
  window.addEventListener('unhandledrejection', (e) => {
    pushErr('unhandledrejection', (e.reason && e.reason.stack) || String(e.reason));
  });

  const origErr = console.error.bind(console);
  console.error = (...args) => {
    pushErr('console.error', args.map((a) => (a && a.stack) ? a.stack : String(a)).join(' '));
    origErr(...args);
  };

  if (typeof WebGL2RenderingContext !== 'undefined') {
    const proto = WebGL2RenderingContext.prototype;
    const origCompile = proto.compileShader;
    proto.compileShader = function(shader) {
      origCompile.call(this, shader);
      try {
        if (!this.getShaderParameter(shader, this.COMPILE_STATUS)) {
          const log = this.getShaderInfoLog(shader) || 'Unknown shader compile error';
          window.__QA_SHADER_ERRORS.push({ kind: 'compileShader', log: log.slice(0, 800) });
        }
      } catch (_) {}
    };
    const origLink = proto.linkProgram;
    proto.linkProgram = function(prog) {
      origLink.call(this, prog);
      try {
        if (!this.getProgramParameter(prog, this.LINK_STATUS)) {
          const log = this.getProgramInfoLog(prog) || 'Unknown program link error';
          window.__QA_SHADER_ERRORS.push({ kind: 'linkProgram', log: log.slice(0, 800) });
        }
      } catch (_) {}
    };
  }
})();
`;

await page.cdp('Page.addScriptToEvaluateOnNewDocument', { source: MONITOR_SCRIPT });

async function getErrors() {
  return await page.evaluate(() => ({
    errors: window.__QA_ERRORS || [],
    shaderErrors: window.__QA_SHADER_ERRORS || [],
  }));
}

async function assertZeroErrors(stage) {
  const { errors, shaderErrors } = await getErrors();
  if (errors.length > 0 || shaderErrors.length > 0) {
    throw new Error(
      `Errors at [${stage}]:\n` +
      `  runtime/console (${errors.length}): ${JSON.stringify(errors.slice(0, 5))}\n` +
      `  shader (${shaderErrors.length}): ${JSON.stringify(shaderErrors.slice(0, 5))}`
    );
  }
}

// Helper: sample WebGL2 canvas right after synchronous deck.test.draw() so preserveDrawingBuffer=false never yields blank
async function sampleCanvasStats() {
  return await page.evaluate(() => {
    const deck = window.__deck;
    if (deck?.test?.draw) deck.test.draw();
    const canvas = document.querySelector('canvas');
    if (!canvas) return { ok: false, reason: 'no canvas' };
    const gl = canvas.getContext('webgl2');
    if (!gl) return { ok: false, reason: 'no webgl2 context' };

    const w = canvas.width;
    const h = canvas.height;
    if (w < 10 || h < 10) return { ok: false, reason: `tiny canvas ${w}x${h}` };

    // Read a 64x36 downsampled grid via single readPixels of the full framebuffer or row slices?
    // Reading full RGBA buffer once is fast (~5ms at 1440x900) and avoids 2000 tiny readPixels calls.
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);

    const stepX = Math.max(1, Math.floor(w / 64));
    const stepY = Math.max(1, Math.floor(h / 36));
    let n = 0;
    let sumR = 0, sumG = 0, sumB = 0;
    let sumL = 0, sumL2 = 0;
    let leftR = 0, leftG = 0, leftB = 0, leftN = 0;
    let rightR = 0, rightG = 0, rightB = 0, rightN = 0;
    const hashBins = [];

    for (let y = 0; y < h; y += stepY) {
      for (let x = 0; x < w; x += stepX) {
        const idx = (y * w + x) * 4;
        const r = buf[idx];
        const g = buf[idx + 1];
        const b = buf[idx + 2];
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        sumR += r; sumG += g; sumB += b;
        sumL += l; sumL2 += l * l;
        n++;
        if (x < w * 0.45) { leftR += r; leftG += g; leftB += b; leftN++; }
        if (x > w * 0.55) { rightR += r; rightG += g; rightB += b; rightN++; }
      }
    }
    // 8x4 coarse RGB signature for diffing (e.g. split drag)
    for (let gy = 0; gy < 4; gy++) {
      for (let gx = 0; gx < 8; gx++) {
        const sx = Math.floor(((gx + 0.5) / 8) * w);
        const sy = Math.floor(((gy + 0.5) / 4) * h);
        const idx = (sy * w + sx) * 4;
        hashBins.push(buf[idx], buf[idx + 1], buf[idx + 2]);
      }
    }

    const meanR = sumR / n;
    const meanG = sumG / n;
    const meanB = sumB / n;
    const meanL = sumL / n;
    const variance = Math.max(0, sumL2 / n - meanL * meanL);
    const stdDev = Math.sqrt(variance);

    return {
      ok: true,
      w,
      h,
      meanR: +meanR.toFixed(2),
      meanG: +meanG.toFixed(2),
      meanB: +meanB.toFixed(2),
      meanL: +meanL.toFixed(2),
      variance: +variance.toFixed(2),
      stdDev: +stdDev.toFixed(2),
      leftRGB: [+(leftR / leftN).toFixed(1), +(leftG / leftN).toFixed(1), +(leftB / leftN).toFixed(1)],
      rightRGB: [+(rightR / rightN).toFixed(1), +(rightG / rightN).toFixed(1), +(rightB / rightN).toFixed(1)],
      sig: hashBins,
    };
  });
}

function rgbDist(a, b) {
  return Math.hypot(a.meanR - b.meanR, a.meanG - b.meanG, a.meanB - b.meanB);
}

function sigDiff(sigA, sigB) {
  let sum = 0;
  for (let i = 0; i < sigA.length; i++) sum += Math.abs(sigA[i] - sigB[i]);
  return sum / sigA.length;
}

try {
  // =========================================================================
  // 1. Desktop 1440x900 via HTTP (headless=1 for deterministic seek & shots)
  // =========================================================================
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: false });

  await page.goto(`${HTTP_URL}?headless=1&quick=1`, { timeout: 25000 });
  await page.waitForFunction(() => window.ready === true && !!window.__deck && !!window.__deck.test, undefined, { timeout: 25000 });
  await assertZeroErrors('HTTP desktop boot (?headless=1&quick=1)');
  pass('Desktop HTTP boot (1440x900), WebGL2 ready, zero shader/runtime errors');

  // Verify deck metadata
  const deckInfo = await page.evaluate(() => {
    const d = window.__deck;
    const canvas = document.querySelector('canvas');
    return {
      hasCanvas: !!canvas,
      canvasW: canvas?.width || 0,
      canvasH: canvas?.height || 0,
      hasSeek: typeof d.test?.seek === 'function',
      hasTrans: typeof d.test?.trans === 'function',
      hasDraw: typeof d.test?.draw === 'function',
      sceneIds: d.scenes ? d.scenes.map((s) => s.id) : null,
    };
  });
  assert.equal(deckInfo.hasCanvas, true, 'Canvas element missing');
  assert.equal(deckInfo.hasSeek, true, 'deck.test.seek missing');
  assert.equal(deckInfo.hasTrans, true, 'deck.test.trans missing');
  pass(`Deck test harness verified (${deckInfo.canvasW}x${deckInfo.canvasH})`);

  // =========================================================================
  // 2. Seek ALL 10 scenes, verify non-blank variance, distinct palettes, capture showcase shots
  // =========================================================================
  const SCENE_SHOWCASE = [
    { id: 'boring',  beat: 2, t: 6.2,  shot: '01-boring-takeover.png',  artifact: 'shot-01-boring-takeover.png' },
    { id: 'scale',   beat: 3, t: 4.8,  shot: '02-scale.png',            artifact: 'shot-02-scale.png' },
    { id: 'breath',  beat: 1, t: 4.8,  shot: '03-breath-snowball.png',  artifact: 'shot-03-breath-snowball.png' },
    { id: 'five',    beat: 1, t: 4.2,  shot: '04-five-extinctions.png', artifact: 'shot-04-five-extinctions.png' },
    { id: 'window',  beat: 2, t: 4.8,  shot: '05-window-holocene.png',  artifact: 'shot-05-window-holocene.png' },
    { id: 'coal',    beat: 2, t: 6.2,  shot: '06-coal.png',             artifact: 'shot-06-coal.png' },
    { id: 'flicker', beat: 2, t: 5.0,  shot: '07-flicker-clock.png',    artifact: 'shot-07-flicker-clock.png' },
    { id: 'split',   beat: 0, t: 3.2,  shot: '08-split-worlds.png',     artifact: 'shot-08-split-worlds.png' },
    { id: 'zoom',    beat: 1, t: 5.8,  shot: '09-zoom-cliff.png',       artifact: 'shot-09-zoom-cliff.png' },
    { id: 'ending',  beat: 2, t: 11.6, shot: '10-ending-tilt.png',      artifact: 'shot-10-ending-tilt.png' },
  ];

  // First visit each scene's beats cleanly in order so snapshots populate for Scene 9 (`zoom`) too!
  const sceneStats = {};
  for (const item of SCENE_SHOWCASE) {
    await page.evaluate(async ({ id, beat, t }) => {
      await window.__deck.test.seek(id, beat, t);
      window.__deck.test.draw();
    }, item);

    const stats = await sampleCanvasStats();
    assert.equal(stats.ok, true, `Scene ${item.id} canvas sample failed: ${stats.reason}`);
    assert.ok(stats.variance > 8, `Scene ${item.id} appears blank/flat: variance=${stats.variance}, meanRGB=(${stats.meanR},${stats.meanG},${stats.meanB})`);
    assert.ok(stats.meanL > 1.5, `Scene ${item.id} appears totally black: meanL=${stats.meanL}`);
    await assertZeroErrors(`scene:${item.id}`);

    sceneStats[item.id] = stats;
    const shotPath = `${SHOTS_DIR}/${item.shot}`;
    await page.screenshot({ path: shotPath });
    await fs.copyFile(shotPath, `${ARTIFACT_DIR}/${item.artifact}`);
    console.log(`  Scene ${item.id.padEnd(8)} -> meanRGB(${stats.meanR},${stats.meanG},${stats.meanB}) stdDev=${stats.stdDev} var=${stats.variance}`);
  }

  // Also sweep beat 0 of every scene to be 100% sure no beat throws or compiles broken shaders
  for (const item of SCENE_SHOWCASE) {
    await page.evaluate(async ({ id }) => {
      await window.__deck.test.seek(id, 0, 1.5);
      window.__deck.test.draw();
    }, item);
    await assertZeroErrors(`scene:${item.id}:beat0`);
  }

  // Check palette diversity across scenes
  let distinctPairs = 0;
  const ids = SCENE_SHOWCASE.map((s) => s.id);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (rgbDist(sceneStats[ids[i]], sceneStats[ids[j]]) > 20) distinctPairs++;
    }
  }
  assert.ok(distinctPairs >= 10, `Expected distinct visual palettes across scenes, only ${distinctPairs} pairs differed > 20`);
  pass(`All 10 scenes rendered non-blank with distinct palettes (${distinctPairs} distinct pairs) & showcase shots saved`);

  // =========================================================================
  // 3. Test ALL 9 scene-entry physical GLSL transitions mid-way (p = 0.5)
  //    (line, wash, flaps, daybreak, slam, fold, tear, portal-in, portal-out)
  // =========================================================================
  const TRANSITION_TARGETS = [
    ['scale', 'line'],
    ['breath', 'wash'],
    ['five', 'flaps'],
    ['window', 'daybreak'],
    ['coal', 'slam'],
    ['flicker', 'fold'],
    ['split', 'tear'],
    ['zoom', 'portal-in'],
    ['ending', 'portal-out'],
  ];
  for (const [targetSceneId, trName] of TRANSITION_TARGETS) {
    await page.evaluate(async (id) => {
      await window.__deck.test.trans(id, 0.5);
    }, targetSceneId);
    const tStats = await sampleCanvasStats();
    assert.equal(tStats.ok, true, `Transition ${trName} (-> ${targetSceneId}) sample failed`);
    assert.ok(tStats.variance > 4, `Transition ${trName} (-> ${targetSceneId}) mid-frame looks blank (var=${tStats.variance})`);
    await assertZeroErrors(`transition:${trName}`);
  }
  pass(`All ${TRANSITION_TARGETS.length} physical GLSL transitions verified at p=0.5 with zero shader errors`);

  // =========================================================================
  // 4. Reload in live interactive mode (?quick=1, RAF active) for controls & split drag
  // =========================================================================
  await page.goto(`${HTTP_URL}?quick=1`, { timeout: 25000 });
  await page.waitForFunction(() => window.ready === true && !!window.__deck, undefined, { timeout: 25000 });
  await assertZeroErrors('Live interactive boot (?quick=1)');

  // 4a. Test Scene 8 (split) interactive divider drag (jump keeps RAF active!)
  await page.evaluate(() => {
    window.__deck.jump('split', 0);
  });
  await page.waitForTimeout(950);
  const beforeDrag = await sampleCanvasStats();
  const sceneBeforeDrag = await page.evaluate(() => window.__deck.info().scene);
  assert.equal(sceneBeforeDrag, 'split', `Expected to be on split scene, got ${sceneBeforeDrag}`);

  // Drag vertical divider from center (720, 450) to right (1150, 450)
  await page.mouse.move(720, 450, { label: 'Move to split divider center' });
  await page.mouse.down();
  for (const x of [820, 930, 1040, 1150]) {
    await page.mouse.move(x, 450, { label: 'Drag split divider right' });
    await page.waitForTimeout(50);
  }
  await page.mouse.up();
  await page.waitForTimeout(300);

  const afterDrag = await sampleCanvasStats();
  const sceneAfterDrag = await page.evaluate(() => window.__deck.info().scene);
  const dragDelta = sigDiff(beforeDrag.sig, afterDrag.sig);

  // Verify we stayed on Scene 8 ('split') and did NOT advance to 'zoom'
  assert.equal(sceneAfterDrag, 'split', `Dragging split divider accidentally changed scene to ${sceneAfterDrag}`);
  assert.ok(dragDelta > 2.5, `Dragging split divider did not visibly change rendered pixels (sigDiff=${dragDelta.toFixed(2)})`);
  await assertZeroErrors('split-drag');
  pass(`Scene 8 split-screen divider drag changed pixels (sigDiff=${dragDelta.toFixed(2)}) and stayed on split`);

  // 4b. Test keyboard presenter controls: ArrowRight, ArrowLeft, N, O, ., ?, A, M
  await page.evaluate(() => {
    window.__deck.jump('boring', 0);
  });
  await page.waitForFunction(
    () => !window.__deck.trans && window.__deck.info().scene === 'boring' && window.__deck.info().beat === 0,
    undefined,
    { timeout: 10000 }
  );
  await page.waitForTimeout(150);

  const getDeckSnap = () => page.evaluate(() => {
    const d = window.__deck;
    const info = d.info();
    const notesEl = document.querySelector('#ui .notes');
    const overEl = document.querySelector('#ui .over');
    const helpEl = document.querySelector('#ui .help');
    return {
      hash: location.hash,
      scene: info.scene,
      beat: info.beat,
      notesText: info.notes,
      auto: d.auto,
      muted: d.muted,
      hasNotesDom: !!notesEl,
      notesDomText: notesEl ? (notesEl.innerText || '').trim() : '',
      hasOverDom: !!overEl,
      overCount: overEl ? overEl.querySelectorAll('button').length : 0,
      hasHelpDom: !!helpEl,
      helpDomText: helpEl ? (helpEl.innerText || '').trim() : '',
    };
  });

  const navStart = await getDeckSnap();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(250);
  const navNext = await getDeckSnap();
  assert.ok(
    navNext.beat !== navStart.beat || navNext.scene !== navStart.scene,
    `ArrowRight did not advance state: before=${JSON.stringify(navStart)}, after=${JSON.stringify(navNext)}`
  );

  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(250);
  const navBack = await getDeckSnap();
  assert.equal(navBack.beat, navStart.beat, `ArrowLeft did not step back to beat ${navStart.beat}, got ${navBack.beat}`);
  pass('Keyboard ArrowRight / ArrowLeft navigation verified');

  // N: Speaker notes overlay
  await page.keyboard.press('KeyN');
  await page.waitForTimeout(200);
  const notesOn = await getDeckSnap();
  assert.equal(notesOn.hasNotesDom, true, 'Pressing N did not open .notes overlay');
  assert.ok(/[\u4e00-\u9fff]/.test(notesOn.notesDomText) && !notesOn.notesDomText.includes('无演讲者备注'),
    `Speaker notes overlay missing Chinese notes: "${notesOn.notesDomText}"`);
  await page.keyboard.press('KeyN');
  await page.waitForTimeout(150);
  const notesOff = await getDeckSnap();
  assert.equal(notesOff.hasNotesDom, false, 'Pressing N again did not close .notes overlay');
  pass('Keyboard N speaker notes overlay verified');

  // O: Slide overview grid
  await page.keyboard.press('KeyO');
  await page.waitForTimeout(250);
  const ovOn = await getDeckSnap();
  assert.equal(ovOn.hasOverDom, true, 'Pressing O did not open .over slide overview grid');
  assert.equal(ovOn.overCount, 10, `Expected 10 slide cards in overview grid, got ${ovOn.overCount}`);
  await page.keyboard.press('KeyO');
  await page.waitForTimeout(150);
  pass(`Keyboard O slide overview grid verified (${ovOn.overCount} slide cards)`);

  // '.': Black screen toggle
  await page.keyboard.press('Period');
  await page.waitForTimeout(550);
  const blackStats = await sampleCanvasStats();
  assert.ok(blackStats.meanL < 12, `Pressing '.' did not darken canvas (meanL=${blackStats.meanL})`);
  await page.keyboard.press('Period');
  await page.waitForTimeout(550);
  const unblackStats = await sampleCanvasStats();
  assert.ok(unblackStats.meanL > blackStats.meanL + 10, `Pressing '.' again did not restore canvas (meanL=${unblackStats.meanL})`);
  pass(`Keyboard '.' black screen toggle verified (dark meanL=${blackStats.meanL} -> restored=${unblackStats.meanL})`);

  // '?': Help overlay
  await page.keyboard.press('Shift+Slash');
  await page.waitForTimeout(200);
  const helpOn = await getDeckSnap();
  assert.equal(helpOn.hasHelpDom, true, "Pressing '?' did not reveal .help overlay");
  assert.ok(helpOn.helpDomText.includes('下一页'), `Help overlay missing expected shortcut text: "${helpOn.helpDomText}"`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const helpOff = await getDeckSnap();
  assert.equal(helpOff.hasHelpDom, false, 'Pressing Escape did not close .help overlay');
  pass("Keyboard '?' help overlay verified");

  // 'A': Autoplay toggle & 'M': Mute toggle
  const beforeAM = await getDeckSnap();
  await page.keyboard.press('KeyA');
  await page.waitForTimeout(150);
  const afterA = await getDeckSnap();
  assert.notEqual(beforeAM.auto, afterA.auto, 'KeyA should toggle deck.auto');
  await page.keyboard.press('KeyA');
  await page.waitForTimeout(150);

  await page.keyboard.press('KeyM');
  await page.waitForTimeout(150);
  const afterM = await getDeckSnap();
  assert.notEqual(beforeAM.muted, afterM.muted, 'KeyM should toggle deck.muted');
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(150);

  await assertZeroErrors('keyboard-presenter-controls');
  pass('Keyboard A (autoplay) & M (mute) toggles verified with zero errors');

  // =========================================================================
  // 5. Mobile Portrait 390x844 Layout Verification
  // =========================================================================
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: true });
  await page.goto(`${HTTP_URL}?headless=1&quick=1`, { timeout: 25000 });
  await page.waitForFunction(() => window.ready === true && !!window.__deck, undefined, { timeout: 25000 });

  const mobileLayout = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const r = c ? c.getBoundingClientRect() : null;
    return {
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
      ih: window.innerHeight,
      canvasRect: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
    };
  });
  assert.ok(mobileLayout.sw <= mobileLayout.iw + 1, `Mobile horizontal overflow: ${mobileLayout.sw} > ${mobileLayout.iw}`);
  assert.ok(mobileLayout.canvasRect && mobileLayout.canvasRect.w >= 380 && mobileLayout.canvasRect.h >= 800,
    `Mobile canvas did not fill viewport: ${JSON.stringify(mobileLayout.canvasRect)}`);

  for (const [id, beat, t] of [['scale', 3, 4.5], ['split', 0, 3.2], ['ending', 2, 9.8]]) {
    await page.evaluate(async ({ id, beat, t }) => {
      await window.__deck.test.seek(id, beat, t);
      window.__deck.test.draw();
    }, { id, beat, t });
    const mStats = await sampleCanvasStats();
    assert.ok(mStats.ok && mStats.variance > 8, `Mobile scene ${id} blank/flat (var=${mStats.variance})`);
  }
  await page.evaluate(async () => {
    await window.__deck.test.seek('flicker', 2, 4.5);
    window.__deck.test.draw();
  });
  await page.screenshot({ path: `${SHOTS_DIR}/mobile-portrait.png` });
  await fs.copyFile(`${SHOTS_DIR}/mobile-portrait.png`, `${ARTIFACT_DIR}/shot-mobile-portrait.png`);
  await assertZeroErrors('mobile-portrait-390x844');
  pass('Mobile portrait (390x844) layout & rendering verified with zero overflow/errors');

  // =========================================================================
  // 6. Offline file:// verification (reuse same p1 via goto())
  // =========================================================================
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
  await page.goto(`${FILE_URL}?quick=1`, { timeout: 25000 });
  await page.waitForFunction(() => window.ready === true && !!window.__deck, undefined, { timeout: 25000 });

  await page.evaluate(async () => {
    await window.__deck.test.seek('breath', 1, 4.8);
    window.__deck.test.draw();
  });
  const fileStats = await sampleCanvasStats();
  assert.ok(fileStats.ok && fileStats.variance > 8, `file:// scene render failed: ${JSON.stringify(fileStats)}`);
  await assertZeroErrors('file:// offline boot');
  pass('Offline file:// direct load verified with WebGL2 rendering & zero errors');

  // Clear device metrics override cleanly
  await page.cdp('Emulation.clearDeviceMetricsOverride');

  // Close any extra pages opened during testing, keeping p1 intact (per AGENTS.md)
  const pagesNow = await task.pages();
  for (const p of pagesNow) {
    if (p.label !== 'p1') {
      await p.close();
    }
  }

  console.log(`\nALL ${passed} EGO-BROWSER UI & VISUAL CHECKS PASSED.`);
} finally {
  server.close();
}
