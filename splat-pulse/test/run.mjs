import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new globalThis.URL('../', import.meta.url));
const URL = 'http://127.0.0.1:8907/splat-pulse/index.html';
const SHOTS = '/tmp/splat-pulse-shots';
await fs.mkdir(SHOTS, { recursive: true });
const task = await taskSpace('splat-pulse-mobile-release');
const managedPages = await task.pages();
const page = managedPages[0] || await task.newPage();
console.log('TaskSpace:', task.spaceId, 'Page:', page.label);
let passed = 0;
const failures = [];
const checkpoints = [];
function check(name, condition, detail = '') {
  if (condition) { passed++; console.log('✓ ' + name); }
  else { failures.push(name); console.log('✗ ' + name, detail); }
}
async function shot(name) {
  checkpoints.push(await page.evaluate(() => ({
    url: location.href, width: innerWidth, height: innerHeight,
    form: window.__pulse.state.form, playing: window.__pulse.engine.playing,
    glError: window.__pulse.renderer.gl.getError(), errors: window.__errs.slice(),
  })));
  console.log('  checkpoint:', name);
}
async function state() {
  return page.evaluate(() => ({
    ...window.__pulse.getState(),
    ready: window.__pulse.state.ready,
    errors: window.__errs,
    renderError: window.__pulse.state.renderError,
    renderer: window.__pulse.renderer?.info(),
  }));
}
async function range(selector, value) {
  await page.evaluate(({ selector, value }) => {
    const input = document.querySelector(selector);
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, { selector, value });
}
async function viewport(width, height, mobile) {
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: mobile ? 2 : 1, mobile,
  });
  await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
}
async function load() {
  await page.goto(URL);
  await page.waitForFunction(() => window.__ready === true, undefined, { timeout: 30000 });
  await page.waitForTimeout(450);
}
async function upload(name = 'pulse-120.wav') {
  const chooserPromise = page.waitForFileChooser({ timeout: 10000 });
  await page.click('#upload');
  const chooser = await chooserPromise;
  await chooser.setFiles(`${ROOT}/test/fixtures/${name}`);
  await page.waitForFunction(() => window.__pulse.engine.kind === 'file', undefined, { timeout: 15000 });
}
async function canvasPixels() {
  return page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => {
      const renderer = window.__pulse.renderer;
      const gl = renderer.gl;
      const width = renderer.canvas.width;
      const height = renderer.canvas.height;
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let bright = 0;
      let green = 0;
      let sum = 0;
      for (let i = 0; i < pixels.length; i += 64) {
        const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
        sum += r + g + b;
        if (r + g + b > 100) bright++;
        if (g > 60 && g > b * 1.2 && r > b * 1.1) green++;
      }
      resolve({ bright, green, sum, error: gl.getError(), width, height });
    });
  }));
}

await page.cdp('Runtime.enable');
await page.cdp('Page.enable');
await page.cdp('Page.addScriptToEvaluateOnNewDocument', {
  source: `if (!window.__errorCapture) { window.__errorCapture = true; window.__consoleErrors = []; const error = console.error; console.error = (...args) => { window.__consoleErrors.push(args.map(String).join(' ')); error.apply(console, args); }; }`,
});

console.log('\n[桌面 1440×900]');
await viewport(1440, 900, false);
await load();
let current = await state();
check('首屏就绪且使用 WebGL2', current.ready && current.renderer?.backend === 'WebGL2');
check('首屏无脚本或渲染错误', current.errors.length === 0 && !current.renderError, JSON.stringify(current));
check('完整生成 72,000 颗三维高斯', current.renderer?.generated === 72000);
check('默认未播放，不伪造 BPM', !current.playing && current.bpm == null);
check('页面无横向或纵向溢出', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.documentElement.scrollHeight <= innerHeight + 1));
const pixels = await canvasPixels();
check('画布有真实高斯像素，不是空白背景', pixels.bright > 500 && pixels.green > 80 && pixels.error === 0, JSON.stringify(pixels));
await shot('01-desktop-entangle');

await page.click('#demo-link');
await page.waitForFunction(() => window.__pulse.engine.playing && window.__pulse.engine.kind === 'demo', undefined, { timeout: 15000 });
await page.waitForTimeout(2200);
current = await state();
check('内置节拍可真实播放', current.playing && current.kind === 'demo' && current.currentTime > 0.5, JSON.stringify(current));
check('内置音频也经过实时分析', current.beatCount > 0 && current.renderer.bands.some((v) => v > 0.03), JSON.stringify(current.renderer?.features));
await page.click('#play');
await page.waitForFunction(() => !window.__pulse.engine.playing);
const pausedAt = (await state()).currentTime;
await page.waitForTimeout(350);
check('暂停冻结音频时间', Math.abs((await state()).currentTime - pausedAt) < 0.08);

await upload();
await page.waitForFunction(() => window.__pulse.engine.playing && window.__pulse.engine.currentTime > 0.2, undefined, { timeout: 10000 });
await page.waitForFunction(() => Number.isFinite(window.__pulse.engine.features.bpm), undefined, { timeout: 12000 });
current = await state();
check('本地 WAV 文件上传、解码并自动播放', current.playing && current.trackName.includes('pulse-120'), current.trackName);
check('真实鼓点触发 onset', current.beatCount >= 3, `onsets=${current.beatCount}`);
check('从节拍间隔估算出 BPM', current.bpm >= 70 && current.bpm <= 180, `bpm=${current.bpm}`);
check('120 BPM 测试鼓点识别在合理误差内', Math.abs(current.bpm - 120) <= 8, `bpm=${current.bpm}`);
check('音频频谱实际进入高斯渲染器', current.renderer.bands.some((v) => v > 0.06) && current.renderer.features.bass > 0.01, JSON.stringify(current.renderer.features));
const beforeTime = current.currentTime;
await page.waitForTimeout(500);
check('播放时间连续推进', (await state()).currentTime > beforeTime + 0.25);
await shot('02-desktop-live-audio');

await page.click('#play');
await page.waitForFunction(() => !window.__pulse.engine.playing);
const pausedFileTime = (await state()).currentTime;
await page.waitForTimeout(350);
check('上传曲目可暂停且时间冻结', Math.abs((await state()).currentTime - pausedFileTime) < 0.08);
await page.waitForFunction(() => document.querySelector('#bpm').textContent === '--', undefined, { timeout: 3000 });
check('暂停后 BPM 不继续伪装实时值', await page.evaluate(() => document.querySelector('#bpm').textContent === '--'));
const twoSecondSeek = await page.evaluate(() => 2000 / window.__pulse.engine.duration);
await range('#seek', twoSecondSeek);
check('暂停状态可精确 seek', Math.abs((await state()).currentTime - 2) < 0.08, `time=${(await state()).currentTime}`);
await range('#volume', 23);
check('音量滑杆控制真实增益', await page.evaluate(() => Math.abs(window.__pulse.engine.volume - 0.23) < 0.001 && Math.abs(window.__pulse.engine._gain.gain.value - 0.23) < 0.001));
await page.click('#mute');
check('静音按钮将增益降为零', (await state()).volume === 0);
await page.click('#mute');
check('取消静音恢复之前音量', Math.abs((await state()).volume - 0.23) < 0.001);
await page.click('#play');
await page.waitForFunction(() => window.__pulse.engine.playing);
await range('#seek', 900);
current = await state();
check('播放中 seek 不中断播放状态', current.playing && current.currentTime >= current.duration * 0.9 - 0.15 && current.currentTime < current.duration, `time=${current.currentTime}`);
await page.waitForFunction(() => !window.__pulse.engine.playing, undefined, { timeout: 6000 });
check('曲目结束自动回到停止状态', !(await state()).playing);

await page.click('[data-form="1"]');
await page.waitForFunction(() => window.__pulse.state.morph === 1, undefined, { timeout: 6000 });
check('潮汐形态切换并完成 morph', await page.evaluate(() => window.__pulse.state.form === 1 && window.__pulse.state.morph === 1 && document.querySelector('[data-form="1"]').getAttribute('aria-pressed') === 'true'));
await shot('03-desktop-tidal');
await page.focus('#view');
await page.keyboard.press('3');
await page.waitForTimeout(1500);
check('数字键切换到奇点形态', await page.evaluate(() => window.__pulse.state.form === 2));
await shot('04-desktop-singularity');
await page.keyboard.press('1');
await page.waitForTimeout(1500);

await page.click('#tune-toggle');
check('调谐面板展开且 ARIA 同步', await page.evaluate(() => !document.querySelector('#tuning').hidden && document.querySelector('#tune-toggle').getAttribute('aria-expanded') === 'true'));
await range('#intensity', 185);
await range('#point-size', 132);
check('反应强度与高斯尺寸真实生效', await page.evaluate(() => window.__pulse.state.intensity === 1.85 && window.__pulse.state.pointSize === 1.32 && document.querySelector('#intensity-value').textContent === '185%'));
await page.click('[data-palette="1"]');
check('冰川配色切换生效', await page.evaluate(() => window.__pulse.state.palette === 1 && document.querySelector('[data-palette="1"]').getAttribute('aria-pressed') === 'true'));
await page.click('#auto-orbit');
check('自动环绕开关生效', await page.evaluate(() => !window.__pulse.state.autoOrbit && document.querySelector('#auto-orbit').getAttribute('aria-checked') === 'false'));
await shot('05-desktop-tuning');
await range('#intensity', 100);
await range('#point-size', 100);
await page.click('[data-palette="0"]');
await page.click('#tune-close');

const yawBefore = await page.evaluate(() => window.__pulse.state.targetYaw);
await page.mouse.move(860, 410);
await page.mouse.down();
await page.mouse.move(970, 450);
await page.mouse.up();
check('拖拽改变三维相机角度', await page.evaluate((before) => Math.abs(window.__pulse.state.targetYaw - before) > 0.2, yawBefore));
const distanceBefore = await page.evaluate(() => window.__pulse.state.targetDistance);
await page.mouse.wheel(0, -260);
check('滚轮改变相机距离', await page.evaluate((before) => window.__pulse.state.targetDistance < before, distanceBefore));
await page.dblclick('#view');
check('双击重置视角', await page.evaluate(() => Math.abs(window.__pulse.state.targetDistance - 7.5) < 0.01));

await page.keyboard.press('h');
check('H 开启无界面纯净演出', await page.evaluate(() => document.body.classList.contains('immersive')));
await shot('06-desktop-immersive');
await page.click('#exit-immersive');
check('纯净模式可以退出', await page.evaluate(() => !document.body.classList.contains('immersive')));
await page.click('#about-open');
check('技术说明以对话框打开', await page.evaluate(() => document.querySelector('#about').open));
await page.click('#about-close');
check('技术说明正常关闭', await page.evaluate(() => !document.querySelector('#about').open));
await page.click('#fullscreen');
await page.waitForTimeout(400);
const full = await page.evaluate(() => Boolean(document.fullscreenElement));
check('全屏按钮进入浏览器全屏', full);
if (full) {
  await page.click('#fullscreen');
  await page.waitForTimeout(250);
  check('再次点击退出全屏', await page.evaluate(() => !document.fullscreenElement));
}

await upload('not-audio.txt').catch(() => {});
await page.waitForTimeout(500);
check('非法音频给出错误且保留当前曲目', await page.evaluate(() => window.__pulse.engine.kind === 'file' && document.querySelector('#toast').classList.contains('error') && document.querySelector('#toast').textContent.length > 4));
await page.evaluate(async () => {
  const response = await fetch('test/fixtures/pulse-120.wav');
  const data = await response.arrayBuffer();
  const transfer = new DataTransfer();
  transfer.items.add(new File([data], 'dropped-pulse.wav', { type: 'audio/wav' }));
  for (const type of ['dragenter', 'dragover', 'drop']) window.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }));
});
await page.waitForFunction(() => window.__pulse.engine.trackName.includes('dropped-pulse') && window.__pulse.engine.playing, undefined, { timeout: 15000 });
check('拖放音乐进入同一真实解码播放链路', true);
check('拖放遮罩在 drop 后关闭', await page.evaluate(() => document.querySelector('#drop-overlay').hidden));
check('桌面全程无 JS 或 WebGL 错误', await page.evaluate(() => window.__errs.length === 0 && window.__consoleErrors.length === 0 && !window.__pulse.state.renderError), JSON.stringify(await state()));

console.log('\n[手机 390×844]');
await viewport(390, 844, true);
await load();
current = await state();
check('手机首屏完成且高斯预算自适应', current.ready && current.renderer.visible <= 42000 && current.renderer.visible > 10000, JSON.stringify(current.renderer));
check('手机无页面溢出', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.documentElement.scrollHeight <= innerHeight + 1));
check('手机主要控件都在视口内', await page.evaluate(() => ['.topbar', '.intro', '.forms', '.transport', '.tune-toggle'].every((selector) => {
  const box = document.querySelector(selector).getBoundingClientRect();
  return box.left >= -1 && box.right <= innerWidth + 1 && box.top >= -1 && box.bottom <= innerHeight + 1;
})));
const mobilePixels = await canvasPixels();
check('手机画布有真实三维内容', mobilePixels.bright > 200 && mobilePixels.error === 0, JSON.stringify(mobilePixels));
await shot('07-mobile-home');
await upload();
await page.waitForFunction(() => window.__pulse.engine.playing, undefined, { timeout: 10000 });
await page.waitForTimeout(2100);
check('手机上传音乐并驱动频谱', await page.evaluate(() => window.__pulse.engine.playing && window.__pulse.state.features.bands.some((v) => v > 0.04)));
await shot('08-mobile-playing');
await page.click('[data-form="2"]');
await page.waitForTimeout(1500);
check('手机形态按钮可点击', await page.evaluate(() => window.__pulse.state.form === 2));
await page.click('#tune-toggle');
check('手机调谐面板不超出视口', await page.evaluate(() => {
  const box = document.querySelector('#tuning').getBoundingClientRect();
  return !document.querySelector('#tuning').hidden && box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight;
}));
await shot('09-mobile-tuning');
await page.click('#tune-close');
const mobileYaw = await page.evaluate(() => window.__pulse.state.targetYaw);
await page.cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 160, y: 440 }] });
await page.cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 230, y: 470 }] });
await page.cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
check('手机单指拖拽旋转', await page.evaluate((before) => Math.abs(window.__pulse.state.targetYaw - before) > 0.1, mobileYaw));
const mobileDistance = await page.evaluate(() => window.__pulse.state.targetDistance);
await page.cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 130, y: 430 }, { x: 250, y: 430 }] });
await page.cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 95, y: 430 }, { x: 285, y: 430 }] });
await page.cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
check('手机双指捏合缩放', await page.evaluate((before) => Math.abs(window.__pulse.state.targetDistance - before) > 0.3, mobileDistance));
check('手机全程无 JS 或 WebGL 错误', await page.evaluate(() => window.__errs.length === 0 && window.__consoleErrors.length === 0 && !window.__pulse.state.renderError), JSON.stringify(await state()));
console.log('手机实测 FPS:', (await page.evaluate(() => window.__pulse.state.fps)).toFixed(1));

console.log('\n[小屏手机 360×640]');
await viewport(360, 640, true);
await load();
current = await state();
check('小屏首屏就绪且使用移动渲染预算', current.ready && current.renderer.visible <= 42000 && !current.renderError);
check('小屏无页面溢出', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.documentElement.scrollHeight <= innerHeight + 1));
check('小屏标题、形态和播放台互不重叠', await page.evaluate(() => {
  const intro = document.querySelector('.intro').getBoundingClientRect();
  const forms = document.querySelector('.forms').getBoundingClientRect();
  const transport = document.querySelector('.transport').getBoundingClientRect();
  return intro.bottom < forms.top && forms.bottom < transport.top;
}));
await shot('10-small-phone');
await page.click('#play');
await page.waitForFunction(() => window.__pulse.engine.playing, undefined, { timeout: 10000 });
check('小屏内置播放可点击', await page.evaluate(() => window.__pulse.engine.context.state === 'running'));
await page.click('#play');

console.log('\n[手机横屏 844×390]');
await viewport(844, 390, true);
await load();
current = await state();
check('横屏首屏使用移动渲染预算', current.ready && current.renderer.visible <= 42000 && current.renderer.visible > 10000, JSON.stringify(current.renderer));
check('横屏无页面溢出', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.documentElement.scrollHeight <= innerHeight + 1));
check('横屏主要控件都在视口内', await page.evaluate(() => ['.topbar', '.intro', '.forms', '.transport', '.tune-toggle'].every((selector) => {
  const box = document.querySelector(selector).getBoundingClientRect();
  return box.left >= -1 && box.right <= innerWidth + 1 && box.top >= -1 && box.bottom <= innerHeight + 1;
})));
check('横屏标题与播放台不重叠且隐藏拥挤读数', await page.evaluate(() => {
  const intro = document.querySelector('.intro').getBoundingClientRect();
  const transport = document.querySelector('.transport').getBoundingClientRect();
  return intro.bottom < transport.top && getComputedStyle(document.querySelector('.beat-readout')).display === 'none';
}));
check('横屏形态栏不压住播放台', await page.evaluate(() => document.querySelector('.forms').getBoundingClientRect().bottom < document.querySelector('.transport').getBoundingClientRect().top));
await shot('11-landscape-phone');
await page.click('#tune-toggle');
check('横屏调谐面板完整可用', await page.evaluate(() => {
  const panel = document.querySelector('#tuning').getBoundingClientRect();
  const transport = document.querySelector('.transport').getBoundingClientRect();
  return !document.querySelector('#tuning').hidden && panel.top >= 0 && panel.bottom <= transport.top + 1;
}));
await shot('12-landscape-tuning');
await page.click('#tune-close');
check('横屏上传按钮完整可读', await page.evaluate(() => {
  const button = document.querySelector('#upload').getBoundingClientRect();
  return button.width >= 100 && button.height >= 36 && button.right <= innerWidth;
}));
await upload();
await page.waitForFunction(() => window.__pulse.engine.playing, undefined, { timeout: 10000 });
await page.waitForTimeout(1200);
check('横屏实际上传播放并驱动频谱', await page.evaluate(() => window.__pulse.engine.playing && window.__pulse.state.features.bands.some((value) => value > 0.04)));
await shot('13-landscape-playing');
await page.click('#play');
const landscapeYaw = await page.evaluate(() => window.__pulse.state.targetYaw);
await page.cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 420, y: 170 }] });
await page.cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 490, y: 180 }] });
await page.cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
check('横屏触摸旋转', await page.evaluate((before) => Math.abs(window.__pulse.state.targetYaw - before) > 0.1, landscapeYaw));
check('横屏无 JS 或 WebGL 错误', await page.evaluate(() => window.__errs.length === 0 && window.__consoleErrors.length === 0 && !window.__pulse.state.renderError), JSON.stringify(await state()));

console.log('\n[小手机横屏 568×320]');
await viewport(568, 320, true);
await load();
current = await state();
check('小横屏首屏使用移动渲染预算', current.ready && current.renderer.visible <= 42000 && !current.renderError);
check('小横屏无溢出且上传按钮完整', await page.evaluate(() => {
  const upload = document.querySelector('#upload').getBoundingClientRect();
  return document.documentElement.scrollWidth <= innerWidth + 1 && upload.width >= 100 && upload.right <= innerWidth;
}));
check('小横屏标题、形态和播放台不重叠', await page.evaluate(() => {
  const intro = document.querySelector('.intro').getBoundingClientRect();
  const forms = document.querySelector('.forms').getBoundingClientRect();
  const tune = document.querySelector('.tune-toggle').getBoundingClientRect();
  const transport = document.querySelector('.transport').getBoundingClientRect();
  return intro.right < forms.left && intro.bottom < transport.top && forms.bottom < tune.top && tune.bottom < transport.top;
}));
await shot('14-small-landscape');
await page.click('#tune-toggle');
check('小横屏调谐面板可滚动且不超出播放区', await page.evaluate(() => {
  const panel = document.querySelector('#tuning');
  const box = panel.getBoundingClientRect();
  const transport = document.querySelector('.transport').getBoundingClientRect();
  return box.top >= 0 && box.bottom <= transport.top + 1 && panel.scrollHeight >= panel.clientHeight;
}));
await shot('15-small-landscape-tuning');
await fs.writeFile(`${SHOTS}/checkpoints.json`, JSON.stringify(checkpoints, null, 2));

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('FAILED:', failures.join(' | '));
  process.exitCode = 1;
}
