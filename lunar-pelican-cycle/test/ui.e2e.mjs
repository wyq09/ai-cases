import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const FILE_URL = 'file:///Users/yiqunwu/wuyiqun/power_project/ai-x/ai_coding/ai-cases/lunar-pelican-cycle/index.html';
const SHOTS_DIR = '/Users/yiqunwu/wuyiqun/power_project/ai-x/ai_coding/ai-cases/lunar-pelican-cycle/shots';

await fs.mkdir(SHOTS_DIR, { recursive: true });

const spaces = await listTaskSpaces();
const existing = spaces.find((s) => s.name === 'lunar-pelican-cycle regression');
const task = existing
  ? (existing.ownership === 'user'
      ? await claimTaskSpace(existing.id)
      : existing.ownership === 'agentDelegatedToUser'
        ? await takeOverTaskSpace(existing.id)
        : await taskSpace(existing.id))
  : await taskSpace('lunar-pelican-cycle regression');

const page = (await task.pages())[0] ?? (await task.adopt((await task.tabs())[0].page));
console.log({ taskSpaceId: task.spaceId, page: page.label });

let uiPassed = 0;
function pass(msg) {
  uiPassed++;
  console.log('PASS:', msg);
}

// Helper to check non-overlap between HUD regions
async function checkLayoutIntegrity(label) {
  const layout = await page.evaluate(() => {
    const sw = document.documentElement.scrollWidth;
    const iw = window.innerWidth;
    const ih = window.innerHeight;
    const rectOf = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const topBar = rectOf('.top-bar');
    const telBar = rectOf('#telemetry-bar');
    const touchPad = rectOf('#touch-controls');
    const steerPad = rectOf('#steer-pad');
    const rightPad = rectOf('.right-pad');

    const overlaps = (a, b) => {
      if (!a || !b) return false;
      return !(a.right <= b.left + 1 || a.left >= b.right - 1 || a.bottom <= b.top + 1 || a.top >= b.bottom - 1);
    };
    const outOfBounds = (r) => r && (r.left < -1 || r.top < -1 || r.right > iw + 1 || r.bottom > ih + 1);

    return {
      sw,
      iw,
      ih,
      topBar,
      telBar,
      touchPad,
      steerPad,
      rightPad,
      overlapTopTel: overlaps(topBar, telBar),
      overlapTelSteer: overlaps(telBar, steerPad),
      overlapTelRight: overlaps(telBar, rightPad),
      overlapSteerRight: overlaps(steerPad, rightPad),
      oobTel: outOfBounds(telBar),
      oobSteer: outOfBounds(steerPad),
      oobRight: outOfBounds(rightPad),
    };
  });
  assert.ok(layout.sw <= layout.iw + 1, `${label}: horizontal overflow ${layout.sw} > ${layout.iw}`);
  assert.equal(layout.overlapTopTel, false, `${label}: top-bar overlaps telemetry-bar`);
  assert.equal(layout.overlapTelSteer, false, `${label}: telemetry-bar overlaps steer-pad`);
  assert.equal(layout.overlapTelRight, false, `${label}: telemetry-bar overlaps right-pad`);
  assert.equal(layout.overlapSteerRight, false, `${label}: steer-pad overlaps right-pad`);
  assert.equal(layout.oobTel, false, `${label}: telemetry-bar clipped off viewport`);
  assert.equal(layout.oobSteer, false, `${label}: steer-pad clipped off viewport`);
  assert.equal(layout.oobRight, false, `${label}: right-pad clipped off viewport`);
  pass(`${label}: layout fits viewport with zero overlap`);
  return layout;
}

// 1. Desktop 1280x800
await page.cdp('Emulation.setDeviceMetricsOverride', {
  width: 1280,
  height: 800,
  deviceScaleFactor: 1,
  mobile: false,
});
await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
await page.goto(FILE_URL);
await page.waitForFunction(() => window.__LUNAR_PELICAN__?.ready && window.__LUNAR_PELICAN__.frames > 20, undefined, { timeout: 15000 });

const initStats = await page.evaluate(() => {
  const api = window.__LUNAR_PELICAN__;
  const c = document.getElementById('gl-canvas');
  const gl = c.getContext('webgl2');
  const px = new Uint8Array(4);
  gl.readPixels(Math.floor(c.width * 0.5), Math.floor(c.height * 0.5), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const pxFloor = new Uint8Array(4);
  gl.readPixels(Math.floor(c.width * 0.5), Math.floor(c.height * 0.2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pxFloor);
  return {
    stats: api.getCanvasStats(),
    errors: api.getErrors(),
    state: api.getState(),
    centerPx: Array.from(px),
    floorPx: Array.from(pxFloor),
  };
});
assert.equal(initStats.errors.length, 0, 'Desktop zero runtime errors');
assert.equal(initStats.stats.webgl2, true, 'WebGL2 active');
assert.ok(initStats.floorPx[0] + initStats.floorPx[1] + initStats.floorPx[2] > 10, 'Rendered regolith pixels non-black');
pass('Desktop init, WebGL2 rendering & non-blank frame');
await checkLayoutIntegrity('Desktop 1280x800');
await page.screenshot({ path: `${SHOTS_DIR}/desktop-hero.png` });

// 2. Desktop Keyboard Drive, Wheelspin Dust & Lunar Jump
await page.keyboard.down('KeyW');
await page.keyboard.down('ShiftLeft');
await page.waitForTimeout(2300);
const sprintState = await page.evaluate(() => window.__LUNAR_PELICAN__.getState());
assert.ok(sprintState.speed > 1.5, `Expected speed > 1.5, got ${sprintState.speed}`);
assert.ok(sprintState.slipRatio > 0.1 || sprintState.activeDust > 0, `Expected slip or dust, slip=${sprintState.slipRatio}, dust=${sprintState.activeDust}`);
pass('Desktop sprint acceleration & lunar wheelspin dust');

await page.keyboard.press('Space');
await page.waitForTimeout(700);
const airState = await page.evaluate(() => window.__LUNAR_PELICAN__.getState());
assert.ok(airState.altitude > 0.7, `Expected airborne altitude > 0.7m, got ${airState.altitude}`);
assert.equal(airState.feltG, 0, 'Expected feltG === 0 in freefall');
pass('Desktop Space jump airborne & 0.00 G freefall');
await page.screenshot({ path: `${SHOTS_DIR}/desktop-action.png` });

await page.keyboard.up('ShiftLeft');
await page.keyboard.up('KeyW');
await page.waitForTimeout(2400);

// 3. Side Profile Camera
await page.keyboard.press('KeyC');
await page.keyboard.down('KeyW');
await page.keyboard.down('ShiftLeft');
await page.waitForTimeout(950);
await page.keyboard.up('ShiftLeft');
await page.keyboard.up('KeyW');
const sideState = await page.evaluate(() => window.__LUNAR_PELICAN__.getState());
assert.equal(sideState.camMode, 'side', 'Camera switched to side profile');
pass('Side camera toggle via C');
await page.screenshot({ path: `${SHOTS_DIR}/side-profile.png` });

// Switch back to chase camera
await page.keyboard.press('KeyC');
await page.keyboard.press('KeyC');

// 4. Physics Lab Drawer & Gravity Environment Toggle + Auto-Cruise
await page.click('#btn-lab', { label: 'Open physics lab drawer' });
await page.waitForSelector('#lab-drawer:not(.hidden)', { state: 'visible' });
await page.click('#env-earth', { label: 'Switch to Earth physics' });
const earthCheck = await page.evaluate(() => window.__LUNAR_PELICAN__.getState().envId);
assert.equal(earthCheck, 'earth', 'Environment switched to Earth');
await page.click('#env-moon', { label: 'Switch back to Moon physics' });
const moonCheck = await page.evaluate(() => window.__LUNAR_PELICAN__.getState().envId);
assert.equal(moonCheck, 'moon', 'Environment switched back to Moon');
await page.click('#btn-lab-close', { label: 'Close physics lab drawer' });
pass('Physics Lab drawer & Moon/Earth toggle');

await page.click('#btn-auto', { label: 'Toggle auto-cruise on' });
const posBeforeAuto = await page.evaluate(() => window.__LUNAR_PELICAN__.getState());
await page.waitForTimeout(1000);
const posAfterAuto = await page.evaluate(() => window.__LUNAR_PELICAN__.getState());
const autoMoved = Math.hypot(posAfterAuto.x - posBeforeAuto.x, posAfterAuto.z - posBeforeAuto.z);
assert.ok(autoMoved > 1.0, `Expected auto-cruise movement > 1m, got ${autoMoved.toFixed(2)}m`);
await page.click('#btn-auto', { label: 'Toggle auto-cruise off' });
pass('Auto-cruise navigation moves pelican smoothly');

// 5. Mobile Portrait 390x844
await page.click('#btn-reset', { label: 'Reset to Base Camp before mobile test' });
await page.cdp('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
});
await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: true });
await page.waitForTimeout(350);

const mobileLayout = await checkLayoutIntegrity('Mobile Portrait 390x844');
assert.ok(mobileLayout.touchPad !== null && mobileLayout.steerPad !== null && mobileLayout.rightPad !== null, 'Mobile touch controls must be visible');
pass('Mobile portrait touch controls visible');

// Real CDP touch input on Pedal & Hop buttons
const touchTargets = await page.evaluate(() => {
  const center = (sel) => {
    const r = document.querySelector(sel).getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  };
  return { pedal: center('#btn-pedal'), hop: center('#btn-hop') };
});
await page.cdp('Input.dispatchTouchEvent', {
  type: 'touchStart',
  touchPoints: [{ x: touchTargets.pedal.x, y: touchTargets.pedal.y, id: 1 }],
});
await page.waitForTimeout(1400);
await page.cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await page.cdp('Input.dispatchTouchEvent', {
  type: 'touchStart',
  touchPoints: [{ x: touchTargets.hop.x, y: touchTargets.hop.y, id: 2 }],
});
await page.waitForTimeout(450);
const mobState = await page.evaluate(() => window.__LUNAR_PELICAN__.getState());
await page.cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
assert.ok(mobState.speed > 0.8 && mobState.altitude > 0.4, `Mobile touch should accelerate & hop: speed=${mobState.speed}, alt=${mobState.altitude}`);
pass('Mobile touch pedal + hop responsive');
await page.screenshot({ path: `${SHOTS_DIR}/mobile-portrait.png` });

// 6. Mobile Landscape 844x390
await page.cdp('Emulation.setDeviceMetricsOverride', {
  width: 844,
  height: 390,
  deviceScaleFactor: 2,
  mobile: true,
});
await page.waitForTimeout(350);
await checkLayoutIntegrity('Mobile Landscape 844x390');
await page.screenshot({ path: `${SHOTS_DIR}/mobile-landscape.png` });

// 7. Reset device metrics override and verify steady clean state
await page.cdp('Emulation.clearDeviceMetricsOverride');
await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
await page.reload();
await page.waitForFunction(() => window.__LUNAR_PELICAN__?.ready && window.__LUNAR_PELICAN__.frames > 15, undefined, { timeout: 15000 });
const fileCheck = await page.evaluate(() => ({
  ready: window.__LUNAR_PELICAN__.ready,
  stats: window.__LUNAR_PELICAN__.getCanvasStats(),
  errors: window.__LUNAR_PELICAN__.getErrors(),
}));
assert.equal(fileCheck.ready, true);
assert.equal(fileCheck.stats.webgl2, true);
assert.equal(fileCheck.errors.length, 0);
pass('Offline file:// reload clean with WebGL2 & zero errors');

console.log(`\nALL ${uiPassed} EGO-BROWSER UI & VISUAL CHECKS PASSED. Stats:`, fileCheck.stats);
