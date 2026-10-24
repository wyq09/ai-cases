(function () {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PALETTES = [
    [[0.74, 1.0, 0.30], [0.055, 0.48, 0.39]],
    [[0.50, 0.84, 1.0], [0.12, 0.28, 0.57]],
    [[1.0, 0.48, 0.25], [0.52, 0.13, 0.15]],
  ];
  const FORM_NAMES = ['ENTANGLE', 'TIDAL WAVE', 'SINGULARITY'];
  const state = {
    ready: false,
    mobile: innerWidth <= 700,
    shortScreen: innerHeight <= 500,
    form: 0,
    from: 0,
    morph: 0,
    yaw: 0.48,
    pitch: 0.18,
    distance: innerWidth <= 700 ? 10.0 : 7.5,
    targetYaw: 0.48,
    targetPitch: 0.18,
    targetDistance: innerWidth <= 700 ? 10.0 : 7.5,
    zoomed: false,
    autoOrbit: !reducedMotion,
    intensity: 1,
    pointSize: 1,
    palette: 0,
    quality: 1,
    dprCap: Math.min(devicePixelRatio || 1, innerHeight <= 500 ? 1.35 : innerWidth <= 700 ? 1.5 : 1.65),
    fps: 0,
    frameCount: 0,
    immersive: false,
    contextLost: false,
    renderError: null,
    features: { bass: 0, mid: 0, high: 0, level: 0, envelope: 0, beatAge: 1, bands: new Float32Array(32) },
  };
  const forcedLimit = clamp(Number(window.__q && window.__q.n) || 72000, 1024, 72000);
  const requestedForm = Number(window.__q && window.__q.form);
  if ([0, 1, 2].includes(requestedForm)) { state.form = requestedForm; state.from = requestedForm; }
  const canvas = $('#view');
  let renderer = null;
  let geometry = null;
  let engine = null;
  let lastTime = 0;
  let audioTimer = 0;
  let lastAudioTime = 0;
  let elapsed = 0;
  let fpsTime = 0;
  let fpsFrames = 0;
  let qualityTime = 0;
  let uiTime = 0;
  let toastTimer = 0;
  let seeking = false;
  let dragDepth = 0;
  let lastBeatClass = false;
  let spectrumBars = [];
  let loading = false;

  function toast(message, error = false, duration = 3500) {
    clearTimeout(toastTimer);
    const element = $('#toast');
    element.textContent = message;
    element.classList.toggle('error', error);
    element.classList.add('show');
    toastTimer = setTimeout(() => element.classList.remove('show'), duration);
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return '--:--';
    const total = Math.max(0, Math.floor(seconds));
    return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
  }

  function rangeProgress(input) {
    const percent = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100;
    input.style.setProperty('--progress', `${percent}%`);
  }

  function setAutoOrbit(value) {
    state.autoOrbit = Boolean(value);
    $('#auto-orbit').setAttribute('aria-checked', String(state.autoOrbit));
  }

  function syncAudio() {
    if (!engine) return;
    const audio = engine.getState();
    document.body.classList.toggle('is-playing', audio.playing);
    $('#play-icon').innerHTML = audio.playing ? '<path d="M8 6v12M16 6v12"/>' : '<path d="m9 6 9 6-9 6Z"/>';
    $('#play').setAttribute('aria-label', audio.playing ? '暂停音乐' : audio.kind ? '播放音乐' : '播放内置节拍');
    $('#track-name').textContent = audio.trackName || '给点声音，让它活过来';
    $('#track-name').title = audio.trackName || '给点声音，让它活过来';
    $('#track-source').textContent = audio.kind === 'file' ? 'LOCAL FILE / 本地音乐' : audio.kind === 'demo' ? 'BUILT-IN LOOP / WEB AUDIO' : 'YOUR SOUND, YOUR SPACE';
    $('#track-status').textContent = audio.playing ? '正在聆听 · 实时频谱与节拍分析' : audio.kind ? '已暂停 · 准备好时继续' : '音乐仅在本地播放，不会上传';
    $('#seek').disabled = !audio.kind || !Number.isFinite(audio.duration);
    $('#analysis-label').textContent = audio.playing ? '正在分析节拍' : audio.kind ? '声音已暂停' : '等待声音输入';
    $('#volume').value = Math.round(audio.volume * 100);
    rangeProgress($('#volume'));
    $('#mute').setAttribute('aria-label', audio.volume === 0 ? '取消静音' : '静音');
    $('#mute').title = audio.volume === 0 ? '取消静音' : '静音';
    $('#mute').style.opacity = audio.volume === 0 ? '.4' : '1';
  }

  async function playPause() {
    if (!engine || loading) return;
    try {
      if (engine.playing) engine.pause();
      else await engine.play();
      syncAudio();
    } catch (error) {
      toast('无法播放：' + error.message, true);
      syncAudio();
    }
  }

  async function playDemo() {
    if (!engine || loading) return;
    loading = true;
    $('#transport').setAttribute('aria-busy', 'true');
    $('#track-status').textContent = '正在合成一小段电子节拍…';
    try {
      await engine.loadDemo();
      await engine.play();
    } catch (error) {
      toast('内置音频无法播放：' + error.message, true);
    } finally {
      loading = false;
      $('#transport').removeAttribute('aria-busy');
      syncAudio();
    }
  }

  async function loadTrack(file) {
    if (!file || !engine || loading) return;
    loading = true;
    $('#transport').setAttribute('aria-busy', 'true');
    $('#upload').disabled = true;
    $('#track-status').textContent = '正在本地解码，请稍候…';
    try {
      await engine.loadFile(file);
      await engine.play();
      toast('已载入「' + file.name + '」');
    } catch (error) {
      toast(error.message || '这个音频文件无法解码，请换一首试试。', true, 5000);
    } finally {
      loading = false;
      $('#transport').removeAttribute('aria-busy');
      $('#upload').disabled = false;
      $('#audio-file').value = '';
      syncAudio();
    }
  }

  function setForm(index) {
    if (![0, 1, 2].includes(index) || index === state.form) return;
    state.from = state.morph > 0.5 ? state.form : state.from;
    state.form = index;
    state.morph = 0;
    if (!state.zoomed) state.targetDistance = defaultDistance(index);
    $$('.form-button').forEach((button) => {
      const active = Number(button.dataset.form) === index;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    $('#scene-name').textContent = FORM_NAMES[index];
    $('#scene-index').textContent = String(index + 1).padStart(2, '0');
  }

  function defaultDistance(form = state.form) {
    return state.mobile ? (form === 2 ? 11.2 : 10.0) : 7.5;
  }

  function resetCamera() {
    state.targetYaw = 0.48;
    state.targetPitch = 0.18;
    state.zoomed = false;
    state.targetDistance = defaultDistance();
  }

  function tuneOpen(open) {
    $('#tuning').hidden = !open;
    $('#tune-toggle').setAttribute('aria-expanded', String(open));
  }

  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else toast('此浏览器暂不支持网页全屏，可以使用 H 进入纯净模式。', true);
    } catch (error) {
      toast('浏览器没有允许全屏，仍可使用 H 纯净模式。', true);
    }
  }

  function immersive(value) {
    state.immersive = value === undefined ? !state.immersive : Boolean(value);
    document.body.classList.toggle('immersive', state.immersive);
    if (state.immersive) tuneOpen(false);
  }

  function bindInterface() {
    spectrumBars = Array.from({ length: 32 }, () => {
      const bar = document.createElement('i');
      $('#spectrum').appendChild(bar);
      return bar;
    });
    $$('input[type="range"]').forEach(rangeProgress);
    $('#play').addEventListener('click', playPause);
    $('#demo-link').addEventListener('click', playDemo);
    $('#upload').addEventListener('click', () => $('#audio-file').click());
    $('#audio-file').addEventListener('change', (event) => loadTrack(event.target.files[0]));
    $('#volume').addEventListener('input', (event) => {
      engine.setVolume(Number(event.target.value) / 100);
      rangeProgress(event.target);
      syncAudio();
    });
    $('#mute').addEventListener('click', () => {
      if (engine.volume > 0) {
        state.previousVolume = engine.volume;
        engine.setVolume(0);
        $('#volume').value = 0;
      } else {
        engine.setVolume(state.previousVolume || 0.7);
      }
      syncAudio();
    });
    $('#seek').addEventListener('pointerdown', () => { seeking = true; });
    window.addEventListener('pointerup', () => { seeking = false; });
    window.addEventListener('pointercancel', () => { seeking = false; });
    $('#seek').addEventListener('input', (event) => {
      engine.seek(Number(event.target.value) / 1000 * engine.duration);
      rangeProgress(event.target);
      $('#time-current').textContent = formatTime(engine.currentTime);
    });
    $$('.form-button').forEach((button) => button.addEventListener('click', () => setForm(Number(button.dataset.form))));
    $('#tune-toggle').addEventListener('click', () => tuneOpen($('#tuning').hidden));
    $('#tune-close').addEventListener('click', () => tuneOpen(false));
    $('#auto-orbit').addEventListener('click', () => setAutoOrbit(!state.autoOrbit));
    $('#intensity').addEventListener('input', (event) => {
      state.intensity = Number(event.target.value) / 100;
      $('#intensity-value').textContent = event.target.value + '%';
      rangeProgress(event.target);
    });
    $('#point-size').addEventListener('input', (event) => {
      state.pointSize = Number(event.target.value) / 100;
      $('#point-value').textContent = event.target.value + '%';
      rangeProgress(event.target);
    });
    $$('.palette').forEach((button) => button.addEventListener('click', () => {
      state.palette = Number(button.dataset.palette);
      $$('.palette').forEach((item) => {
        const active = item === button;
        item.classList.toggle('active', active);
        item.setAttribute('aria-pressed', String(active));
      });
    }));
    $('#reset-camera').addEventListener('click', resetCamera);
    $('#fullscreen').addEventListener('click', fullscreen);
    $('#exit-immersive').addEventListener('click', () => immersive(false));
    $('#about-open').addEventListener('click', () => { tuneOpen(false); $('#about').showModal(); });
    $('#about-close').addEventListener('click', () => $('#about').close());
    $('#about').addEventListener('click', (event) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.currentTarget.close();
    });
    document.addEventListener('fullscreenchange', () => {
      $('#fullscreen').setAttribute('aria-label', document.fullscreenElement ? '退出全屏' : '进入全屏');
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        tuneOpen(false);
        immersive(false);
        return;
      }
      if (event.target.closest('input, textarea, select, [contenteditable="true"]') || $('#about').open) return;
      if (event.code === 'Space' && !event.target.closest('button, a')) {
        event.preventDefault();
        if (!event.repeat) playPause();
      } else if (['1', '2', '3'].includes(event.key)) setForm(Number(event.key) - 1);
      else if (event.key.toLowerCase() === 'r') resetCamera();
      else if (event.key.toLowerCase() === 'f') fullscreen();
      else if (event.key.toLowerCase() === 'h') immersive();
    });
    window.addEventListener('dragenter', (event) => {
      if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return;
      event.preventDefault();
      dragDepth++;
      $('#drop-overlay').hidden = false;
    });
    window.addEventListener('dragover', (event) => {
      if (!$('#drop-overlay').hidden) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }
    });
    window.addEventListener('dragleave', (event) => {
      event.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) $('#drop-overlay').hidden = true;
    });
    window.addEventListener('drop', (event) => {
      event.preventDefault();
      dragDepth = 0;
      $('#drop-overlay').hidden = true;
      const file = event.dataTransfer?.files?.[0];
      if (file) loadTrack(file);
    });
  }

  function bindCamera() {
    const pointers = new Map();
    let pinchDistance = 0;
    let pinchCamera = 0;
    canvas.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      canvas.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      document.body.classList.add('dragging');
      if (pointers.size === 2) {
        const points = Array.from(pointers.values());
        pinchDistance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        pinchCamera = state.targetDistance;
      }
    });
    canvas.addEventListener('pointermove', (event) => {
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      if (pointers.size === 1) {
        const dx = event.clientX - previous.x;
        const dy = event.clientY - previous.y;
        if (dx || dy) setAutoOrbit(false);
        state.targetYaw -= dx * 0.005;
        state.targetPitch = clamp(state.targetPitch + dy * 0.004, -1.25, 1.25);
      }
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) {
        const points = Array.from(pointers.values());
        const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        state.zoomed = true;
        if (distance > 4 && pinchDistance > 4) state.targetDistance = clamp(pinchCamera * pinchDistance / distance, 4.4, 15);
      }
    });
    function release(event) {
      pointers.delete(event.pointerId);
      if (!pointers.size) document.body.classList.remove('dragging');
    }
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('lostpointercapture', release);
    canvas.addEventListener('dblclick', resetCamera);
    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      state.zoomed = true;
      state.targetDistance = clamp(state.targetDistance * Math.exp(event.deltaY * 0.001), 4.4, 15);
    }, { passive: false });
  }

  function resize() {
    const mobile = innerWidth <= 700;
    const shortScreen = innerHeight <= 500;
    const layoutChanged = mobile !== state.mobile || shortScreen !== state.shortScreen;
    state.mobile = mobile;
    state.shortScreen = shortScreen;
    if (layoutChanged) {
      state.dprCap = Math.min(devicePixelRatio || 1, shortScreen ? 1.35 : mobile ? 1.5 : 1.65);
      if (!state.zoomed) resetCamera();
    }
    if (renderer) renderer.resize(innerWidth, innerHeight, state.dprCap);
  }

  function viewMatrix() {
    const cp = Math.cos(state.pitch);
    const eye = [Math.sin(state.yaw) * cp * state.distance, Math.sin(state.pitch) * state.distance, Math.cos(state.yaw) * cp * state.distance];
    const target = [0, 0, 0];
    const view = PulseGeometry.lookAt(eye, target, [0, 1, 0]);
    const aspect = innerWidth / Math.max(1, innerHeight);
    const fov = 40 * Math.PI / 180;
    const projection = PulseGeometry.perspective(fov, aspect, 0.08, 80);
    const viewProj = PulseGeometry.multiply(projection, view);
    const morph = state.morph * state.morph * (3 - 2 * state.morph);
    return {
      eye, fwd: PulseGeometry.normalize(target.map((value, i) => value - eye[i])), view, viewProj,
      focalPx: renderer.canvas.height * 0.5 / Math.tan(fov / 2),
      center: state.mobile ? [0, -0.07] : state.shortScreen ? [0.14, 0.075] : [0.20, 0.075],
      from: state.from, to: state.form, morph,
      time: elapsed, pointSize: state.pointSize, motion: reducedMotion ? 0.12 : 1,
      maxSize: state.mobile || state.shortScreen ? 23 : 30,
      limit: Math.min(forcedLimit, Math.round((state.mobile || state.shortScreen ? 42000 : 72000) * state.quality)),
      palette: PALETTES[state.palette],
    };
  }

  function audioFeatures(now, dt) {
    const raw = engine.update(now);
    const features = state.features;
    ['bass', 'mid', 'high', 'level'].forEach((key) => {
      const target = clamp((raw[key] || 0) * state.intensity, 0, 1.6);
      const speed = target > features[key] ? 24 : 8;
      features[key] += (target - features[key]) * (1 - Math.exp(-dt * speed));
    });
    if (raw.beat && engine.playing) {
      features.envelope = 1;
      features.beatAge = 0;
    } else {
      features.envelope *= Math.exp(-dt * 8.5);
      features.beatAge = Math.min(1, features.beatAge + dt);
    }
    const bins = engine.spectrum;
    const hzPerBin = engine.context ? engine.context.sampleRate / engine.analyser.fftSize : 0;
    for (let band = 0; band < 32; band++) {
      let value = 0;
      if (engine.playing && hzPerBin) {
        const from = Math.max(1, Math.floor(40 * Math.pow(300, band / 32) / hzPerBin));
        const to = Math.min(bins.length, Math.max(from + 1, Math.floor(40 * Math.pow(300, (band + 1) / 32) / hzPerBin)));
        let peak = 0;
        let sum = 0;
        for (let i = from; i < to; i++) { peak = Math.max(peak, bins[i]); sum += bins[i]; }
        const average = sum / Math.max(1, to - from);
        value = Math.pow(clamp((peak * 0.55 + average * 0.45) / 255, 0, 1), 1.25) * state.intensity;
      }
      features.bands[band] += (value - features.bands[band]) * (1 - Math.exp(-dt * (value > features.bands[band] ? 25 : 10)));
    }
    if (state.frameCount % 2 === 0) spectrumBars.forEach((bar, i) => { bar.style.transform = `scaleY(${Math.max(0.03, features.bands[i]).toFixed(3)})`; });
    const beatClass = features.envelope > 0.72;
    if (beatClass !== lastBeatClass) { document.body.classList.toggle('on-beat', beatClass); lastBeatClass = beatClass; }
    return features;
  }

  function tickAudio() {
    if (document.hidden) return;
    const now = performance.now();
    const dt = lastAudioTime ? Math.min(0.25, (now - lastAudioTime) / 1000) : 1 / 30;
    lastAudioTime = now;
    audioFeatures(now / 1000, dt);
  }

  function startAudioTicker() {
    if (audioTimer) return;
    lastAudioTime = 0;
    tickAudio();
    audioTimer = window.setInterval(tickAudio, 1000 / 30);
  }

  function stopAudioTicker() {
    window.clearInterval(audioTimer);
    audioTimer = 0;
    lastAudioTime = 0;
  }

  function updateReadout() {
    const audio = engine.getState();
    if (!seeking) {
      $('#seek').value = audio.duration ? Math.round(audio.currentTime / audio.duration * 1000) : 0;
      rangeProgress($('#seek'));
    }
    $('#time-current').textContent = formatTime(audio.currentTime);
    $('#time-duration').textContent = formatTime(audio.duration);
    $('#bpm').textContent = audio.playing && audio.bpm ? Math.round(audio.bpm) : '--';
    $('#beat-count').textContent = String(audio.beatCount).padStart(3, '0');
    $('#splats-visible').textContent = renderer ? renderer.visibleCount.toLocaleString('en-US') : '0';
    $('#mute').setAttribute('aria-label', audio.volume === 0 ? '取消静音' : '静音');
    if (audio.volume === 0) $('#mute').style.opacity = '.4';
    else $('#mute').style.opacity = '1';
  }

  function adaptQuality(dt) {
    qualityTime += dt;
    if (qualityTime < 3 || elapsed < 5 || forcedLimit !== 72000) return;
    qualityTime = 0;
    let changed = false;
    if (state.fps < 33) {
      if (state.quality > 0.45) { state.quality = Math.max(0.4, state.quality - 0.15); changed = true; }
      else if (state.dprCap > 1) { state.dprCap = Math.max(1, state.dprCap - 0.25); resize(); }
    } else if (state.fps > 56 && state.quality < 1) {
      state.quality = Math.min(1, state.quality + 0.06);
      changed = true;
    }
    if (changed) updateReadout();
  }

  function frame(timestamp) {
    requestAnimationFrame(frame);
    if (document.hidden) { lastTime = 0; return; }
    const rawDt = lastTime ? (timestamp - lastTime) / 1000 : 1 / 60;
    lastTime = timestamp;
    elapsed += rawDt;
    state.frameCount++;
    const features = state.features;
    if (state.morph < 1) state.morph = Math.min(1, state.morph + rawDt / 1.35);
    const smoothing = 1 - Math.exp(-rawDt * 7);
    if (state.autoOrbit) state.targetYaw += rawDt * 0.045;
    state.yaw += (state.targetYaw - state.yaw) * smoothing;
    state.pitch += (state.targetPitch - state.pitch) * smoothing;
    state.distance += (state.targetDistance - state.distance) * smoothing;
    if (renderer && !state.contextLost && !state.renderError) {
      try {
        renderer.draw(viewMatrix(), features);
      } catch (error) {
        state.renderError = error.message;
        toast('渲染已暂停：' + error.message, true, 8000);
      }
    }
    fpsTime += rawDt;
    fpsFrames++;
    if (fpsTime >= 0.75) {
      state.fps = fpsFrames / fpsTime;
      fpsTime = 0;
      fpsFrames = 0;
    }
    uiTime += rawDt;
    if (uiTime >= 0.1) { uiTime = 0; updateReadout(); }
    adaptQuality(rawDt);
    if (!state.ready && state.frameCount >= 2) {
      state.ready = true;
      document.body.classList.add('ready');
      window.__ready = true;
    }
  }

  function init() {
    bindInterface();
    bindCamera();
    engine = new PulseAudio.AudioEngine({ onChange: syncAudio });
    engine.setVolume(0.7);
    syncAudio();
    setAutoOrbit(state.autoOrbit);
    const initialForm = state.form;
    state.form = -1;
    setForm(initialForm);
    try {
      geometry = PulseGeometry.createGeometry(72000);
      renderer = new PulseRenderer.Renderer(canvas, geometry);
      resize();
    } catch (error) {
      state.renderError = error.message;
      toast(error.message + ' 音频控制仍可使用。', true, 12000);
    }
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      state.contextLost = true;
      toast('图形上下文暂时丢失，等待浏览器恢复…', true, 6000);
    });
    canvas.addEventListener('webglcontextrestored', () => {
      try {
        renderer = new PulseRenderer.Renderer(canvas, geometry);
        state.contextLost = false;
        state.renderError = null;
        resize();
        toast('三维场景已恢复。');
      } catch (error) {
        state.renderError = error.message;
        toast('图形恢复失败：' + error.message, true, 8000);
      }
    });
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', () => {
      lastTime = 0;
      if (document.hidden) stopAudioTicker();
      else startAudioTicker();
    });
    window.__pulse = {
      state, engine, setForm, resetCamera, loadFile: loadTrack, loadDemo: playDemo,
      playPause, fullscreen, immersive, viewMatrix,
      get renderer() { return renderer; },
      get geometry() { return geometry; },
      getState: () => engine.getState(),
    };
    startAudioTicker();
    requestAnimationFrame(frame);
  }

  init();
})();
