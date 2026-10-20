/* =====================================================================
   splat-portal · 主程序
   ---------------------------------------------------------------------
   四个世界串成一条环：
     lily（睡莲） → angel（天使像） → church（山间教堂） → millipede（机械虫）
     → 回到 lily

   传送门：站在当前世界里，前方悬浮一个门洞；门洞里能看到下一个世界的
   同一视角。走近后穿过去，世界切换，同时播放一次「膨胀—收敛」的形态
   过渡（所有高斯沿径向弹开再落位），避免硬切。
   ===================================================================== */
(function () {
  'use strict';

  const ORDER = ['lily', 'angel', 'church', 'millipede'];
  const LABELS = {
    lily: { zh: '睡莲池', en: 'WATER LILY', note: '近景微距 · 叶片与花瓣' },
    angel: { zh: '天使像', en: 'ANGEL', note: '石雕 · 高对比侧光' },
    church: { zh: '山间教堂', en: 'HILL CHURCH', note: '远景建筑 · 植被包裹' },
    millipede: { zh: '机械虫', en: 'MILLIPEDE', note: '工业模型 · 金属与锈迹' },
  };

  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  const state = {
    ready: false,
    loading: {},
    backend: '',
    worlds: {},
    order: ORDER,
    index: 0,
    preset: {},
    usePreset: true,
    // 相机球坐标（围绕当前世界原点）
    yaw: 0,
    pitch: 0,
    dist: 3.0,
    targetYaw: 0,
    targetPitch: 0,
    targetDist: 2.0,
    // 传送门
    phase: 'idle',      // idle | approach | warp | settle
    warp: 0,
    portalOpen: 0,
    autoOrbit: true,
    quality: 'auto',
    dprCap: 2,
    qualityScale: 1,
    fps: 0,
    pointScale: 1.25,
    maxPointPx: (window.__Q && window.__Q.cap) ? Number(window.__Q.cap) : 6.0,
    alphaScale: (window.__Q && window.__Q.alpha) ? Number(window.__Q.alpha) : 0.5,
    kernel: 2.4,
  };

  const canvas = $('#view');
  let renderer = null;
  let manifest = null;
  let loadToken = 0;

  // ---------- 数学小工具 ----------
  function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0,
    ]);
  }
  function lookAt(eye, target, up) {
    const f = norm([target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]]);
    const s = norm(cross(f, up));
    const u = cross(s, f);
    return new Float32Array([
      s[0], u[0], -f[0], 0,
      s[1], u[1], -f[1], 0,
      s[2], u[2], -f[2], 0,
      -dot(s, eye), -dot(u, eye), dot(f, eye), 1,
    ]);
  }
  function mul(out, a, b) {
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
    }
    return out;
  }

  // ---------- 相机 ----------
  const FOV = 48;

  /* 每帧最多提交多少高斯。手机上这个数字直接决定帧率。 */
  function budget() {
    const forced = (window.__Q && window.__Q.n) ? Number(window.__Q.n) : 0;
    if (forced) return forced;
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    const base = mobile ? 45000 : 90000;
    return Math.round(base * state.qualityScale);
  }

  function worldCount(name) {
    const w = state.worlds[name];
    return w && w !== 'loading' && w.splat ? w.splat.count : 0;
  }

  function sphericalEye(yaw, pitch, dist) {
    const cp = Math.cos(pitch);
    return [Math.sin(yaw) * cp * dist, Math.sin(pitch) * dist, Math.cos(yaw) * cp * dist];
  }

  function buildView(widthPx, heightPx) {
    const eye = sphericalEye(state.yaw, state.pitch, state.dist);
    const target = [0, 0, 0];
    const view = lookAt(eye, target, [0, 1, 0]);
    const aspect = widthPx / Math.max(1, heightPx);
    const proj = perspective(FOV * Math.PI / 180, aspect, 0.02, 60);
    const vp = new Float32Array(16);
    mul(vp, proj, view);
    const fwd = norm([target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]]);
    const right = norm(cross(fwd, [0, 1, 0]));
    const up = cross(right, fwd);
    return {
      eye, target, view, proj, viewProj: vp,
      fwd, right, up,
      widthPx, heightPx,
      focalPx: (heightPx * 0.5) / Math.tan((FOV * Math.PI / 180) / 2),
      tanHalfFov: Math.tan((FOV * Math.PI / 180) / 2),
      pointScale: state.pointScale,
      kernel: state.kernel,
      alphaCut: 0.006,
      opacity: 1.0,
      morph: state.warp,
      morphAmount: 1.35,
      morphCenter: [0, 0, 0],
      portal: null,
      maxPointPx: state.maxPointPx,
      alphaScale: state.alphaScale,
    };
  }

  /* 传送门位置：沿当前视线方向、在当前世界的球壳上。
     门法线朝向相机，半径随距离略缩放，保证屏幕上大小稳定。 */
  function portalFrame(view) {
    const dir = view.fwd;
    const center = [dir[0] * state.dist * 0.92, dir[1] * state.dist * 0.92, dir[2] * state.dist * 0.92];
    const normal = [-dir[0], -dir[1], -dir[2]];
    return {
      center,
      normal,
      radius: Math.max(0.20, state.dist * 0.145),
      soft: Math.max(0.035, state.dist * 0.022),
      ring: state.portalOpen * 1.4,
      color: [1.0, 0.72, 0.36],
    };
  }

  // ---------- 世界加载 ----------
  async function fetchSplat(name, core, onProgress) {
    const meta = manifest[name];
    const url = `assets/${name}${core ? '.core' : ''}.bin`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} ${res.status}`);
    const total = Number(res.headers.get('content-length')) || meta.bytes;
    if (!res.body || !res.body.getReader) {
      const buf = await res.arrayBuffer();
      onProgress && onProgress(1);
      return SplatFormat.parse(buf);
    }
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.length;
      onProgress && onProgress(clamp(got / total, 0, 1));
    }
    const buf = new Uint8Array(got);
    let off = 0;
    for (const c of chunks) { buf.set(c, off); off += c.length; }
    return SplatFormat.parse(buf.buffer);
  }

  async function loadWorld(name, core, onProgress) {
    const splat = await fetchSplat(name, core, onProgress);
    SplatFormat.decode(splat, manifest[name]);
    renderer.upload(name, splat);
    state.worlds[name] = { splat, meta: manifest[name] };
  }

  // ---------- 渲染循环 ----------
  let lastT = 0;
  let fpsAcc = 0;
  let fpsN = 0;
  let raf = 0;
  let lastView = null;

  function frame(t) {
    raf = requestAnimationFrame(frame);
    const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0.016;
    lastT = t;

    fpsAcc += dt; fpsN++;
    if (fpsAcc > 0.5) {
      state.fps = fpsN / fpsAcc;
      fpsAcc = 0; fpsN = 0;
      const el = $('#fps');
      if (el) el.textContent = state.fps.toFixed(0);
      autoTune(state.fps, dt);
    }

    if (!state.ready) return;

    // 相机阻尼 + 自动巡游
    if (state.autoOrbit && state.phase === 'idle') state.targetYaw += dt * 0.11;
    state.yaw = lerp(state.yaw, state.targetYaw, 1 - Math.pow(0.0015, dt));
    state.pitch = lerp(state.pitch, state.targetPitch, 1 - Math.pow(0.0025, dt));
    state.dist = lerp(state.dist, state.targetDist, 1 - Math.pow(0.004, dt));

    // 传送门状态机
    updatePortal(dt);

    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, state.dprCap);
    renderer.resize(w, h, dpr);

    const view = buildView(w * dpr, h * dpr);
    lastView = view;
    const nextName = ORDER[(state.index + 1) % ORDER.length];
    const curName = ORDER[state.index];
    const cap = budget();

    renderer.begin();

    // 门外：当前世界（被门洞裁掉）
    if (state.portalOpen > 0.001) {
      view.portal = Object.assign(portalFrame(view), { mode: 1 });
      view.portal.ring = state.portalOpen * 1.2;
    }
    view.morph = state.warp;
    renderer.drawScene(curName, view, Math.min(cap, worldCount(curName)));

    // 门内：下一个世界（同一视角，被门洞裁剩门内）
    if (state.portalOpen > 0.001 && state.worlds[nextName] && state.worlds[nextName] !== 'loading') {
      view.portal = Object.assign(portalFrame(view), { mode: 2 });
      view.morph = 0;
      view.opacity = smoothstep(0, 0.55, state.portalOpen);
      renderer.drawScene(nextName, view, Math.min(cap * 0.7, worldCount(nextName)));
    }

    renderer.end();

    // 门内世界如果还没加载，触发一次后台加载（尽早开始，别等到门开）
    const nn = ORDER[(state.index + 1) % ORDER.length];
    if (!state.worlds[nn] && !state.loading[nn]) {
      state.loading[nn] = true;
      state.worlds[nn] = 'loading';
      loadWorld(nn, false).then(() => {
        delete state.loading[nn];
        if (state.worlds[nn] === 'loading') delete state.worlds[nn];
      }).catch((e) => {
        console.warn('[portal] 预载失败', nn, e);
        delete state.loading[nn];
        delete state.worlds[nn];
      });
    }
  }

  state.warpTargetIsCurrent = false;

  /* 自适应画质：帧率掉下来先降提交点数，再降分辨率；回升后再逐步恢复。
     用滞回区间避免在阈值附近来回跳。 */
  let tuneCool = 0;
  function autoTune(fps, dt) {
    tuneCool -= 0.5;
    if (tuneCool > 0) return;
    if (fps < 34 && state.qualityScale > 0.34) {
      if (state.qualityScale > 0.6) {
        state.qualityScale = Math.max(0.34, state.qualityScale - 0.18);
      } else {
        state.dprCap = Math.max(1, state.dprCap - 0.25);
        state.qualityScale = Math.max(0.3, state.qualityScale - 0.06);
      }
      tuneCool = 3;
    } else if (fps > 55 && state.qualityScale < 1) {
      state.qualityScale = Math.min(1, state.qualityScale + 0.1);
      if (state.qualityScale > 0.9) state.dprCap = Math.min(2, state.dprCap + 0.25);
      tuneCool = 4;
    }
  }

  function updatePortal(dt) {
    if (state.phase === 'warp') {
      state.warp += dt / 0.62;
      state.portalOpen = 1;
      if (state.warp >= 1) {
        state.warp = 0;
        state.index = (state.index + 1) % ORDER.length;
        state.phase = 'settle';
        state.settleT = 0;
        state.portalOpen = 0;
        applyPreset();
        updateHUD();
      }
      return;
    }
    if (state.phase === 'settle') {
      state.settleT = (state.settleT || 0) + dt;
      if (state.settleT > 0.9) state.phase = 'idle';
      return;
    }
    state.portalOpen = lerp(state.portalOpen, 1, 1 - Math.pow(0.02, dt));
  }

  function warp() {
    if (state.phase !== 'idle') return;
    const nextName = ORDER[(state.index + 1) % ORDER.length];
    if (!state.worlds[nextName] || state.worlds[nextName] === 'loading') return;
    state.phase = 'warp';
    state.warp = 0;
    state.autoOrbit = false;
    document.body.classList.add('warping');
    setTimeout(() => document.body.classList.remove('warping'), 900);
  }

  // ---------- HUD ----------
  function applyPreset() {
    const name = ORDER[state.index];
    const m = manifest && manifest[name];
    if (!m || !m.camera) return;
    const az = m.camera.azimuth * Math.PI / 180;
    const el = m.camera.elevation * Math.PI / 180;
    // sphericalEye 用 (sin yaw, sin pitch, cos yaw) 的方向；
    // 烘焙机位是 (sin az cos el, sin el, cos az cos el)，两者 yaw 一致
    state.yaw = state.targetYaw = az;
    state.pitch = state.targetPitch = el;
    // 烘焙机位是「贴脸可见」的近距离，展示时退后一些才能看到全貌
    state.dist = state.targetDist = clamp(m.camera.distance * 2.1, 1.6, 5.0);
  }

  function updateHUD() {
    const name = ORDER[state.index];
    const info = LABELS[name];
    $('#place-zh').textContent = info.zh;
    $('#place-en').textContent = info.en;
    $('#place-note').textContent = info.note;
    const idx = state.index + 1;
    $('#place-index').textContent = String(idx).padStart(2, '0') + ' / ' + String(ORDER.length).padStart(2, '0');
    document.querySelectorAll('.rail-item').forEach((el, i) => {
      el.classList.toggle('active', i === state.index);
    });
    document.documentElement.style.setProperty('--accent', ACCENTS[name]);
  }

  const ACCENTS = {
    lily: '#c9d46a',
    angel: '#c8b49a',
    church: '#8fb3a6',
    millipede: '#d08a5a',
  };

  // ---------- 输入 ----------
  function setupInput() {
    let dragging = false;
    let lastX = 0, lastY = 0;
    let pinchStart = 0, pinchDist = 0;

    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      dragging = true;
      lastX = e.clientX; lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
      state.autoOrbit = false;
      document.body.classList.add('dragging');
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      state.targetYaw -= dx * 0.005;
      state.targetPitch = clamp(state.targetPitch + dy * 0.004, -0.75, 0.85);
    });
    const endDrag = () => {
      dragging = false;
      document.body.classList.remove('dragging');
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      state.autoOrbit = false;
      state.targetDist = clamp(state.targetDist * (1 + Math.sign(e.deltaY) * 0.08), 1.6, 6.0);
    }, { passive: false });

    // 触摸双指缩放
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        const [a, b] = e.touches;
        pinchStart = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        pinchDist = state.targetDist;
      }
    }, { passive: true });
    canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && pinchStart) {
        const [a, b] = e.touches;
        const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        state.targetDist = clamp(pinchDist * (pinchStart / Math.max(d, 1)), 1.6, 6.0);
        state.autoOrbit = false;
      }
    }, { passive: true });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { state.autoOrbit = false; state.targetYaw += 0.12; }
      else if (e.key === 'ArrowLeft') { state.autoOrbit = false; state.targetYaw -= 0.12; }
      else if (e.key === 'ArrowUp') { state.autoOrbit = false; state.targetPitch = clamp(state.targetPitch - 0.1, -0.75, 0.85); }
      else if (e.key === 'ArrowDown') { state.autoOrbit = false; state.targetPitch = clamp(state.targetPitch + 0.1, -0.75, 0.85); }
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); warp(); }
    });

    $('#enter').addEventListener('click', warp);
    $('#auto').addEventListener('click', () => {
      state.autoOrbit = !state.autoOrbit;
      $('#auto').classList.toggle('on', state.autoOrbit);
      $('#auto').setAttribute('aria-pressed', String(state.autoOrbit));
    });
    $('#info-toggle').addEventListener('click', () => {
      document.body.classList.toggle('info-open');
    });
    $('#info-close').addEventListener('click', () => {
      document.body.classList.remove('info-open');
    });
    document.querySelectorAll('.rail-item').forEach((el, i) => {
      el.addEventListener('click', () => {
        if (state.phase !== 'idle') return;
        if (i === state.index) return;
        // 直接切到目标世界（用于探索，不做过渡）
        state.index = i;
        state.portalOpen = 0;
        state.autoOrbit = false;
        applyPreset();
        updateHUD();
      });
    });
  }

  /* WebGPU 适配器有时会短暂返回 null（例如 GPU 进程刚重启），
     重试几次；彻底失败时返回 null 让调用方退回 WebGL2。 */
  async function tryWebGPU() {
    if (!navigator.gpu) return null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (!adapter) { await new Promise(r => setTimeout(r, 220)); continue; }
        const device = await adapter.requestDevice();
        device.addEventListener('uncapturederror', (e) => {
          console.warn('[webgpu]', e.error && e.error.message);
        });
        const ctx = canvas.getContext('webgpu');
        if (!ctx) return null;
        const format = navigator.gpu.getPreferredCanvasFormat();
        ctx.configure({ device, format, alphaMode: 'opaque' });
        return new SplatGPU.RendererGPU(device, ctx, format);
      } catch (e) {
        console.warn('[gpu] attempt', attempt, e);
        await new Promise(r => setTimeout(r, 220));
      }
    }
    return null;
  }

  // ---------- 启动 ----------
  async function boot() {
    manifest = await (await fetch('assets/manifest.json')).json();
    $('#total').textContent = (ORDER.length) + ' 个世界';

    // 选择后端（?backend=gl / gpu 可强制，便于调试与对比）
    const forced = (window.__Q && window.__Q.backend) || '';
    // 默认 WebGL2：跨端表现最稳。WebGPU 后端保留为 ?backend=gpu 的实验路径。
    if (navigator.gpu && forced === 'gpu') {
      renderer = await tryWebGPU();
      if (renderer) state.backend = 'WebGPU';
    }
    if (!renderer) {
      renderer = new SplatGL.RendererGL(canvas);
      state.backend = 'WebGL2';
    }
    if (forced) state.backend += ' ·forced';
    $('#backend').textContent = state.backend;

    // 首屏：先加载当前世界（完整）与下一个世界（核心点）
    const firstName = ORDER[0];
    const nextName = ORDER[1];
    const progress = $('#progress-bar');
    const label = $('#loading-label');

    label.textContent = '载入 ' + LABELS[firstName].zh;
    await loadWorld(firstName, false, (p) => { progress.style.transform = `scaleX(${p * 0.72})`; });
    progress.style.transform = 'scaleX(0.78)';

    label.textContent = '载入 ' + LABELS[nextName].zh;
    await loadWorld(nextName, true, (p) => { progress.style.transform = `scaleX(${0.78 + p * 0.22})`; });
    progress.style.transform = 'scaleX(1)';

    state.ready = true;
    applyPreset();
    updateHUD();
    document.body.classList.add('ready');
    setTimeout(() => document.body.classList.add('ui-in'), 120);

    // 其余世界后台补齐
    (async () => {
      for (let i = 2; i < ORDER.length; i++) {
        const name = ORDER[i];
        try {
          await loadWorld(name, false);
          if (name === ORDER[(state.index + 1) % ORDER.length]) continue;
        } catch (e) { console.warn('后台加载失败', name, e); }
      }
      // 把第一个世界的核心版本也备好（用于回到起点时的快速切换）
    })();

    lastT = 0;
    raf = requestAnimationFrame(frame);

    // 首次进入后若长时间无操作，保持自动巡游
    state.autoOrbit = true;
    $('#auto').classList.add('on');
  }

  function fail(err) {
    console.error(err);
    document.body.classList.add('failed');
    $('#loading-label').textContent = '初始化失败：' + (err && err.message ? err.message : err);
  }

  setupInput();
  boot().catch(fail);

  // 调试出口：把主循环里实际用的视图矩阵暴露出来，便于和离线推导对照
  window.__portal = {
    state, ORDER, warp,
    get renderer() { return renderer; },
    get view() { return lastView; },
    buildView,
  };
})();
