#!/usr/bin/env node
/**
 * splat-portal 回归测试
 *
 * 用 node 内置 WebSocket 直接驱动一个已经开着 --remote-debugging-port 的
 * Chromium（ego lite / Chrome 都可以），验证：
 *   1. 首屏加载完成、无 JS 报错
 *   2. 四个世界都能通过 rail 切换，HUD 同步
 *   3. 传送门能打开、能穿越、穿越后 index 前进
 *   4. 桌面 1440×900 与手机 390×844 两种视口都不溢出、不报错
 *
 * 用法：
 *   node test/run.mjs [cdp-endpoint] [baseUrl]
 * 默认 http://127.0.0.1:9341 与 http://127.0.0.1:8899/index.html
 */
import fs from 'node:fs/promises';

const CDP = process.argv[2] || 'http://127.0.0.1:9341';
const PAGE_URL = process.argv[3] || 'http://127.0.0.1:8899/index.html';
const SHOT_DIR = process.argv[4] || '/tmp/splat-portal-shots';

let pass = 0;
const failures = [];
function check(name, ok, extra = '') {
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { failures.push(name); console.log(`  ✗ ${name} ${extra}`); }
}

async function connect() {
  const list = await (await fetch(`${CDP}/json/list`)).json();
  const page = list.find((t) => t.type === 'page' && t.url.includes('8899'))
    || list.find((t) => t.type === 'page');
  if (!page) throw new Error('没有可用的 page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const logs = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
    else if (m.method === 'Runtime.exceptionThrown') {
      logs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      logs.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
    }
  });
  await new Promise((r) => ws.addEventListener('open', r));
  const send = (method, params = {}) => new Promise((res) => {
    const mid = ++id;
    pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  return { ws, send, logs };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function evaluate(send, expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval failed');
  return r.result.value;
}

async function shot(send, name) {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  await fs.mkdir(SHOT_DIR, { recursive: true });
  await fs.writeFile(`${SHOT_DIR}/${name}.png`, Buffer.from(s.data, 'base64'));
}

async function run({ width, height, dpr, mobile }, label) {
  console.log(`\n[${label}] ${width}×${height} dpr=${dpr}`);
  const conn = await connect();
  const { send, logs } = conn;
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile });
  await send('Page.navigate', { url: PAGE_URL });
  await wait(mobile ? 11000 : 9500);

  const boot = await evaluate(send, `JSON.stringify({
    errs: window.__errs || [],
    ready: !!(window.__portal && window.__portal.state.ready),
    worlds: window.__portal ? Object.keys(window.__portal.state.worlds).length : 0,
    backend: window.__portal ? window.__portal.state.backend : '',
    hud: document.querySelector('#place-index').textContent,
    overflow: document.documentElement.scrollWidth <= window.innerWidth + 1
      && document.documentElement.scrollHeight <= window.innerHeight + 1,
  })`);
  const b = JSON.parse(boot);
  check('页面无 JS 报错', b.errs.length === 0, JSON.stringify(b.errs));
  check('加载完成 ready', b.ready === true);
  check('四个世界全部载入', b.worlds === 4, `got ${b.worlds}`);
  check('渲染后端已选定', /WebGL2|WebGPU/.test(b.backend), b.backend);
  check('页面无滚动溢出', b.overflow === true);
  await shot(send, `${label}-01-home`);

  // rail 切换
  for (const i of [1, 2, 3, 0]) {
    await evaluate(send, `document.querySelectorAll('.rail-item')[${i}].click()`);
    await wait(mobile ? 1500 : 1400);
    const info = JSON.parse(await evaluate(send, `JSON.stringify({
      idx: window.__portal.state.index,
      hud: document.querySelector('#place-index').textContent,
      zh: document.querySelector('#place-zh').textContent,
    })`));
    check(`rail 切到世界 ${i + 1}`, info.idx === i && info.hud.startsWith(String(i + 1).padStart(2, '0')), JSON.stringify(info));
  }
  await shot(send, `${label}-02-world0`);

  // 传送门：打开 → 穿越 → 前进
  const portal = JSON.parse(await evaluate(send, `JSON.stringify({
    open: window.__portal.state.portalOpen,
    next: window.__portal.ORDER[(window.__portal.state.index + 1) % 4],
    nextLoaded: !!window.__portal.state.worlds[window.__portal.ORDER[(window.__portal.state.index + 1) % 4]],
  })`));
  check('传送门已打开', portal.open > 0.5, `open=${portal.open}`);
  check('下一个世界已预载', portal.nextLoaded === true, portal.next);
  await shot(send, `${label}-03-portal`);

  await evaluate(send, 'window.__portal.warp()');
  await wait(2600);   // warp 0.62s + settle 0.9s
  const after = JSON.parse(await evaluate(send, `JSON.stringify({
    idx: window.__portal.state.index,
    phase: window.__portal.state.phase,
    hud: document.querySelector('#place-index').textContent,
  })`));
  check('穿越后世界前进', after.idx >= 1, JSON.stringify(after));
  check('穿越后回到 idle', after.phase === 'idle', after.phase);
  await shot(send, `${label}-04-after-warp`);

  // 帧率（等自适应稳定）
  await wait(2500);
  const fps = await evaluate(send, 'window.__portal.state.fps');
  check('帧率 > 24fps', fps > 24, `${fps.toFixed(1)}`);

  const pageErrs = JSON.parse(await evaluate(send, 'JSON.stringify(window.__errs || [])'));
  check('全流程无运行时报错', pageErrs.length === 0, JSON.stringify(pageErrs));
  check('无未捕获异常', logs.length === 0, logs.slice(0, 3).join(' | '));
  conn.ws.close();
}

await run({ width: 1440, height: 900, dpr: 1, mobile: false }, 'desktop');
await run({ width: 390, height: 844, dpr: 2, mobile: true }, 'mobile');

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('failed:', failures.join(', '));
  process.exit(1);
}
