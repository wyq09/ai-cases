/* =========================================================================
 * 多福巨奖 777 — DF.AUDIO 程序化合成音效引擎（WebAudio，无外部音频资源）
 * 契约:
 *   unlock()                          首手势调用，幂等，创建/resume AudioContext
 *   play(name, {volume, rate})        一次性 cue；循环型 cue 自动转 startLoop
 *   startLoop(name)/stopLoop(name)    循环型 cue（bgm / reelSpin）
 *   duck(ms)                          BGM 闪避：压低后自动恢复
 *   setBGMVolume/setSFXVolume/setMasterVolume(v)
 *   applyOverrides({cue: dataURL})    自定义音效优先，解码失败回落合成
 *   names                             全部 cue 名
 * 信号链: voices → [sfxBus | bgmBus(×0.5)→bgmVol→duck→bgmFade] → comp → master → out
 *         另有噪声 IR 混响发送（send → convolver → return → comp）
 * ========================================================================= */
window.DF = window.DF || {};
DF.AUDIO = (() => {
  'use strict';

  /* ------------------------------ 基础状态 ------------------------------ */
  const NAMES = ['bgm', 'reelSpin', 'reelStop', 'allStop', 'betUp', 'betDown',
    'button', 'goldLand', 'railFill', 'countTick', 'wayWin', 'winSmall',
    'winMid', 'winBig', 'jackpot', 'freeTrigger', 'pickReveal', 'pickMatch',
    'coinRain', 'refill', 'error'];
  const LOOP_CUES = { bgm: 1, reelSpin: 1 };

  const BPM = 80;
  const STEP = 60 / BPM / 2;          // 八分音符时长 (0.375s)
  const LOOP_STEPS = 96;              // 12 小节 × 8 → 36s 无缝循环
  const CHIME = [88, 91, 93, 96];     // 风铃音池 E6 G6 A6 C7（五声）

  let ctx = null, comp = null, master = null, sfxBus = null;
  let bgmBus = null, bgmVol = null, duckGain = null, bgmFade = null;
  let revSend = null, noiseBuf = null, visBound = false;

  const vols = { master: 1, bgm: 0.5, sfx: 1 }; // 默认对齐 cfg.vols

  const loops = {};                   // name -> {playing, stop()}
  let bgmTimer = null, bgmStep = 0, bgmTime = 0, bgmWanted = false;
  const bgmLive = new Set();          // bgm 已调度声源，stopLoop 时强制停

  const ovPending = {};               // cue -> dataURL（待解码）
  const ovBuf = {};                   // cue -> AudioBuffer
  const ovFailed = {};                // cue -> 1（解码失败，永久回落合成）

  /* ------------------------------ 小工具 ------------------------------ */
  const clamp01 = (x) => { x = +x; if (x !== x) x = 0; return Math.min(1, Math.max(0, x)); };
  const now = () => ctx.currentTime;
  const midi2f = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const rt = (o) => (o && o.rate > 0) ? +o.rate : 1;
  const vv = (o) => (o && o.volume != null) ? clamp01(o.volume) : 1;

  // 增益包络：快起音 + 指数衰减（尾音落到 0.0001 后统一 stop）
  function envG(g, t, peak, a, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(Math.max(peak, 0.0001), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  /* 声部容器 V：登记全部节点，done() 在最后一个声源结束时统一 stop+disconnect，
   * sink 用于循环型（bgm）强制停止登记。 */
  function V(bus, sink) {
    const nodes = [], srcs = [];
    let end = 0;
    return {
      g(val, dest) { const g = ctx.createGain(); g.gain.value = val == null ? 1 : val; nodes.push(g); g.connect(dest || bus); return g; },
      f(type, fr, q, dest) { const F = ctx.createBiquadFilter(); F.type = type; F.frequency.value = Math.max(fr, 1); if (q != null) F.Q.value = q; nodes.push(F); F.connect(dest || bus); return F; },
      o(type, fr, t0, dest, det) { const s = ctx.createOscillator(); s.type = type; s.frequency.setValueAtTime(Math.max(fr, 1), t0); if (det) s.detune.value = det; nodes.push(s); srcs.push(s); s.connect(dest || bus); s.start(t0); return s; },
      n(t0, dest, loop) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; if (loop) s.loop = true; nodes.push(s); srcs.push(s); s.connect(dest || bus); s.start(t0); return s; },
      lfo(f, t0, param, amt) { const s = ctx.createOscillator(); s.frequency.value = f; const g = ctx.createGain(); g.gain.value = amt; nodes.push(s, g); srcs.push(s); s.connect(g); g.connect(param); s.start(t0); return s; },
      wet(from, amt) { const g = ctx.createGain(); g.gain.value = amt; nodes.push(g); from.connect(g); g.connect(revSend); return g; },
      keep(t1) { if (t1 > end) end = t1; },
      done(margin) {
        const stopAt = (end || now()) + (margin == null ? 0.05 : margin);
        let n = srcs.length;
        const clean = () => { if (--n > 0) return; for (const x of nodes) { try { x.disconnect(); } catch (_) {} } };
        for (const s of srcs) { try { s.stop(stopAt); } catch (_) {} s.onended = clean; }
        if (!n) clean();
        if (sink) for (const s of srcs) { sink.add(s); s.addEventListener('ended', () => { sink.delete(s); }); }
      }
    };
  }

  /* --------------------------- 通用发声积木 --------------------------- */
  function blip(v, t, f, vel, dec) {                 // 短 UI 音
    const g = v.g(0); envG(g, t, vel, 0.004, dec);
    const lp = v.f('lowpass', 6500, 0.7, g);
    v.o('triangle', f, t, lp);
    const g2 = v.g(0.25, lp); v.o('sine', f * 2, t, g2);
  }
  function pluckS(v, t, f, vel, dec, dest) {         // 古筝拨弦（SFX 亮版）
    const g = v.g(0, dest); envG(g, t, vel, 0.003, dec);
    const lp = v.f('lowpass', Math.min(f * 8, 9500), 0.8, g);
    lp.frequency.setValueAtTime(Math.min(f * 8, 9500), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(f * 2.2, 500), t + dec);
    v.o('triangle', f, t, lp);
    const g2 = v.g(0.35, lp); v.o('sine', f * 2.003, t, g2);
    v.wet(g, 0.12);
  }
  function bellS(v, t, f, vel, dec, dest) {          // 铃/叮（含 2.756 非谐泛音）
    const g = v.g(0, dest); envG(g, t, vel, 0.002, dec);
    v.o('sine', f, t, g);
    const g2 = v.g(0.32, g); v.o('sine', f * 2.756, t, g2);
    const g3 = v.g(0.12, g); v.o('sine', f * 5.404, t, g3);
    v.wet(g, 0.25);
  }
  function nzHit(v, t, vel, dec, type, freq, q, dest) { // 噪声打击
    const g = v.g(0, dest); envG(g, t, vel, 0.001, dec);
    const F = v.f(type, freq, q, g);
    v.n(t, F);
  }
  function boom(v, t, vel, f0, f1, dec) {            // 低频落地
    const g = v.g(0); envG(g, t, vel, 0.005, dec);
    const o = v.o('sine', f0, t, g);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dec * 0.6);
    v.wet(g, 0.2);
  }
  function cymbal(v, t, vel, dec) {                  // 镲片气声
    const g = v.g(0); envG(g, t, vel, 0.004, dec);
    const hp = v.f('highpass', 6200, 0.7, g);
    v.n(t, hp); v.wet(g, 0.4);
  }
  function chordPad(v, t, notes, dur, vel) {         // 和弦垫
    const g = v.g(0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.07);
    g.gain.setValueAtTime(vel, t + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = v.f('lowpass', 2800, 0.5, g);
    for (const m of notes) { v.o('triangle', midi2f(m), t, lp); const sg = v.g(0.5, lp); v.o('sawtooth', midi2f(m), t, sg, 6); }
    v.wet(g, 0.25);
  }
  function horn(v, t, notes, dur, vel) {             // 号角 stab（失谐锯齿）
    const g = v.g(0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.035);
    g.gain.setValueAtTime(vel * 0.85, t + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = v.f('lowpass', 2400, 0.4, g);
    for (const m of notes) { v.o('sawtooth', midi2f(m), t, lp); v.o('sawtooth', midi2f(m), t, lp, 8); }
    v.wet(g, 0.3);
  }
  function timpRoll(v, t, dur, vel) {                // 定音鼓滚（低通噪声+颤音）
    const g = v.g(0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + dur * 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.2);
    const vg = v.g(1, g);
    const lp = v.f('lowpass', 280, 0.6, vg);
    v.n(t, lp, true);
    v.lfo(13, t, vg.gain, 0.5);
    v.wet(g, 0.15);
  }
  function coinPing(v, t, vel, f) {                  // 单枚金币叮
    const g = v.g(0); envG(g, t, vel, 0.001, 0.09 + Math.random() * 0.08);
    v.o('sine', f, t, g);
    const g2 = v.g(0.5, g); v.o('sine', f * 1.34 + Math.random() * 40, t, g2);
    v.wet(g, 0.3);
  }
  function shimmer(v, t, dur, vel) {                 // 高频沙沙幕
    const g = v.g(0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + dur * 0.35);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const hp = v.f('highpass', 7600, 0.7, g);
    v.n(t, hp, true);
    v.lfo(9, t, g.gain, vel * 0.5);
    v.wet(g, 0.3);
  }

  /* ------------------------------ BGM 部分 ------------------------------ */
  // 宫调式五声音阶 C D E G A；旋律手工编排 12 小节（36s），低音垫+轻鼓+风铃
  const MEL = [
    // A 段 (1-4)
    [0,72,2],[2,76,1],[3,79,1],[4,81,2],[6,79,2],
    [8,76,2],[10,74,2],[12,72,2],[14,67,2],
    [16,69,2],[18,72,2],[20,76,2],[22,74,2],
    [24,72,3],[28,64,1],[29,67,1],[30,69,1],[31,74,1],
    // A' 段 (5-8)
    [32,76,2],[34,79,1],[35,81,1],[36,84,2],[38,81,2],
    [40,79,2],[42,76,2],[44,79,2],[46,81,2],
    [48,79,1],[49,76,1],[50,74,2],[52,72,2],[54,69,2],
    [56,72,2],[58,67,2],[60,64,2],[62,67,2],
    // B 段 (9-12)，尾音 G4 引回 C5 无缝循环
    [64,69,2],[66,72,2],[68,74,2],[70,76,2],
    [72,79,3],[75,76,1],[76,74,2],[78,72,2],
    [80,74,2],[82,76,2],[84,79,2],[86,81,2],
    [88,84,4],[92,72,2],[94,67,2]
  ];
  const MELMAP = new Map();
  for (const [s, m, l] of MEL) MELMAP.set(s, [m, l, (s % 4 === 0) ? 1 : 0.8]);
  const ROOTS = [48, 48, 45, 43, 48, 48, 45, 43, 48, 45, 43, 43]; // C A G 循环

  function zheng(midi, t, dur, vel) {                // 古筝拨弦：双失谐三角波+八度泛音+触弦噪声
    const f = midi2f(midi);
    const dec = Math.min(Math.max(dur, 0.5) + 0.9, 1.6);
    const v = V(bgmBus, bgmLive);
    const g = v.g(0); envG(g, t, vel, 0.004, dec);
    const lp = v.f('lowpass', 3600, 0.7, g);
    lp.frequency.setValueAtTime(3600, t);
    lp.frequency.exponentialRampToValueAtTime(1100, t + dec);
    const o1 = v.o('triangle', f, t, lp); o1.detune.value = -5;
    v.o('triangle', f, t, lp, 6);
    const g2 = v.g(0.35, lp); v.o('sine', f * 2, t, g2);
    const ng = v.g(0); envG(ng, t, vel * 0.45, 0.001, 0.03);
    const bp = v.f('bandpass', 2600, 1.2, ng);
    v.n(t, bp);
    v.wet(g, 0.18);
    v.keep(t + dec + 0.1); v.done();
  }
  function bassPad(midi, t, dur, vel) {              // 低音垫：三角波+次八度正弦
    const f = midi2f(midi);
    const v = V(bgmBus, bgmLive);
    const g = v.g(0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.12);
    g.gain.setValueAtTime(vel, t + Math.max(dur - 0.05, 0.12));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.2);
    const lp = v.f('lowpass', 420, 0.5, g);
    v.o('triangle', f, t, lp);
    const g2 = v.g(0.55, lp); v.o('sine', f / 2, t, g2);
    v.keep(t + dur + 0.25); v.done();
  }
  function thump(t, vel) {                           // 轻鼓点
    const v = V(bgmBus, bgmLive);
    const g = v.g(0); envG(g, t, vel, 0.002, 0.16);
    const o = v.o('sine', 120, t, g);
    o.frequency.exponentialRampToValueAtTime(58, t + 0.10);
    v.keep(t + 0.2); v.done();
  }
  function block(t, vel) {                           // 木鱼/梆子点
    const v = V(bgmBus, bgmLive);
    const g = v.g(0); envG(g, t, vel, 0.001, 0.05);
    const bp = v.f('bandpass', 1900, 4, g);
    v.n(t, bp);
    v.keep(t + 0.1); v.done();
  }
  function chime(midi, t) {                          // 风铃
    const f = midi2f(midi);
    const v = V(bgmBus, bgmLive);
    const g = v.g(0); envG(g, t, 0.05, 0.002, 2.6);
    v.o('sine', f, t, g);
    const g2 = v.g(0.4, g); v.o('sine', f * 2.02, t, g2);
    v.wet(g, 0.6);
    v.keep(t + 2.8); v.done();
  }
  function schedStep(step, t) {
    const mel = MELMAP.get(step);
    if (mel) zheng(mel[0], t, mel[1] * STEP, 0.15 * mel[2]);
    const bar = ((step / 8) | 0) % 12, ib = step % 8;
    const root = ROOTS[bar];
    if (ib === 0) { bassPad(root, t, 4 * STEP, 0.12); thump(t, 0.13); }
    else if (ib === 4) { bassPad(root + 7, t, 2 * STEP, 0.085); thump(t, 0.06); }
    else if (ib === 6) { bassPad(root + 12, t, 2 * STEP, 0.06); }
    if ((ib & 1) === 1 && Math.random() < 0.09) block(t, 0.05);
    if (ib === 0 && (bar & 1) === 1 && Math.random() < 0.45) {  // 偶尔风铃点缀
      const n = 1 + ((Math.random() * 3) | 0);
      for (let i = 0; i < n; i++) chime(CHIME[(Math.random() * CHIME.length) | 0], t + Math.random() * STEP * 6);
    }
  }
  function bgmTick() {
    if (!loops.bgm || !loops.bgm.playing || !ctx) return;
    const n = now();
    if (bgmTime < n - 0.05) bgmTime = n + 0.05;      // 唤醒/卡顿后重新对齐
    const ahead = n + 0.45;                          // look-ahead 调度，天然无缝
    while (bgmTime < ahead) { schedStep(bgmStep % LOOP_STEPS, bgmTime); bgmStep++; bgmTime += STEP; }
  }
  function holdParam(p) {
    const t = now();
    if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t);
    else { p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); }
  }
  function startBgmSynth() {
    loops.bgm.stop = stopBgmSynth;
    const t = now();
    holdParam(bgmFade.gain);
    bgmFade.gain.setTargetAtTime(1, t, 0.3);
    if (bgmStep >= LOOP_STEPS) bgmStep = 0;
    bgmTime = t + 0.12;
    if (!bgmTimer) bgmTimer = setInterval(bgmTick, 90);
    bgmTick();
  }
  function stopBgmSynth() {
    holdParam(bgmFade.gain);
    bgmFade.gain.setTargetAtTime(0.0001, now(), 0.09);
  }

  /* ---------------------------- reelSpin 循环 ---------------------------- */
  function startReelSpin() {
    const L = loops.reelSpin, t = now();
    const g = ctx.createGain(); g.gain.value = 0.0001; g.connect(sfxBus);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 680; bp.Q.value = 1.1; bp.connect(g);
    const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 230;
    const g2 = ctx.createGain(); g2.gain.value = 0.5;
    const nz = ctx.createBufferSource(); nz.buffer = noiseBuf; nz.loop = true;
    nz.connect(bp); nz.connect(lp2); lp2.connect(g2); g2.connect(g);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.7;   // 呼啸扫频
    const lg = ctx.createGain(); lg.gain.value = 240; lfo.connect(lg); lg.connect(bp.frequency);
    const fl = ctx.createOscillator(); fl.frequency.value = 15;      // 滚动颗粒抖动
    const fg = ctx.createGain(); fg.gain.value = 0.07; fl.connect(fg); fg.connect(g.gain);
    nz.start(t); lfo.start(t); fl.start(t);
    g.gain.setTargetAtTime(0.45, t, 0.06);
    const all = [nz, lfo, fl, g, bp, lp2, g2, lg, fg];
    L.stop = () => {
      const s = now();
      try { g.gain.cancelScheduledValues(s); g.gain.setValueAtTime(g.gain.value, s); g.gain.setTargetAtTime(0.0001, s, 0.05); } catch (_) {}
      for (const x of [nz, lfo, fl]) { try { x.stop(s + 0.25); } catch (_) {} }
      nz.onended = () => { for (const x of all) { try { x.disconnect(); } catch (_) {} } };
    };
  }

  /* ------------------------- 循环注册表启停 ------------------------- */
  function startBufLoop(name, buf, vol) {            // 覆盖音效的循环（buffer 走此路径）
    const L = loops[name], t = now();
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    src.connect(g); g.connect(name === 'bgm' ? bgmBus : sfxBus);
    src.start(t);
    g.gain.setTargetAtTime(vol, t, 0.08);
    L.stop = () => {
      const s = now();
      try { g.gain.cancelScheduledValues(s); g.gain.setValueAtTime(g.gain.value, s); g.gain.setTargetAtTime(0.0001, s, 0.06); } catch (_) {}
      try { src.stop(s + 0.35); } catch (_) {}
      src.onended = () => { try { src.disconnect(); g.disconnect(); } catch (_) {} };
    };
  }
  function startLoop(name) {
    if (!LOOP_CUES[name]) return;
    ensureCtx(); if (!ctx) return;
    let L = loops[name];
    if (L && L.playing) return;                      // 幂等
    if (!L) L = loops[name] = { playing: false, stop: null };
    const buf = getOv(name);
    if (buf) startBufLoop(name, buf, name === 'bgm' ? 0.9 : 0.85);
    else if (name === 'bgm') startBgmSynth();
    else startReelSpin();
    L.playing = true;
  }
  function stopLoop(name) {
    const L = loops[name];
    if (!L || !L.playing) return;                    // 幂等
    L.playing = false;
    if (name === 'bgm' && bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
    if (L.stop) { try { L.stop(); } catch (_) {} L.stop = null; }
    if (name === 'bgm') {                            // 停干净：斩掉所有已调度声源
      const s = now();
      bgmLive.forEach((x) => { try { x.stop(s + 0.4); } catch (_) {} });
      bgmLive.clear();
    }
  }

  /* --------------------------- 一次性 cue 合成 --------------------------- */
  const SYNTH = {
    // 滚轮制动：低频顿 + click + 轻金属泛音
    reelStop(t, o) {
      const R = rt(o), vel = vv(o), v = V(sfxBus), T = (d) => t + d / R, F = (f) => f * R;
      const g = v.g(0); envG(g, t, 0.85 * vel, 0.003, 0.13);
      const s = v.o('sine', F(175), t, g);
      s.frequency.exponentialRampToValueAtTime(Math.max(F(62), 1), T(0.09));
      nzHit(v, t, 0.5 * vel, 0.03, 'highpass', F(2600), 0.7);
      const g2 = v.g(0); envG(g2, t, 0.12 * vel, 0.002, 0.18);
      v.o('triangle', F(988), T(0.004), g2);
      v.keep(T(0.35)); v.done();
    },
    // 全部落定重音：更沉的落地 + 低通噪声 + 金属泛音簇
    allStop(t, o) {
      const R = rt(o), vel = vv(o), v = V(sfxBus), T = (d) => t + d / R, F = (f) => f * R;
      const g = v.g(0); envG(g, t, 0.9 * vel, 0.004, 0.28);
      const s = v.o('sine', F(135), t, g);
      s.frequency.exponentialRampToValueAtTime(Math.max(F(46), 1), T(0.22));
      nzHit(v, t, 0.6 * vel, 0.06, 'lowpass', F(380), 0.8);
      nzHit(v, t, 0.35 * vel, 0.025, 'highpass', F(3000), 0.7);
      const mg = v.g(0); envG(mg, T(0.005), 0.16 * vel, 0.002, 0.7);
      [659, 987, 1318].forEach((f, i) => {
        const gi = v.g([1, 0.6, 0.35][i], mg);
        v.o('triangle', F(f) * (1 + (i - 1) * 0.002), T(0.004 * i), gi);
      });
      v.wet(mg, 0.3);
      v.keep(T(1.0)); v.done();
    },
    // 押注+：上行双音
    betUp(t, o) {
      const R = rt(o), vel = vv(o), v = V(sfxBus), T = (d) => t + d / R, F = (f) => f * R;
      blip(v, t, F(midi2f(79)), 0.30 * vel, 0.09);
      blip(v, T(0.075), F(midi2f(84)), 0.34 * vel, 0.14);
      v.keep(T(0.3)); v.done();
    },
    // 押注-：下行双音
    betDown(t, o) {
      const R = rt(o), vel = vv(o), v = V(sfxBus), T = (d) => t + d / R, F = (f) => f * R;
      blip(v, t, F(midi2f(84)), 0.30 * vel, 0.09);
      blip(v, T(0.075), F(midi2f(79)), 0.32 * vel, 0.14);
      v.keep(T(0.3)); v.done();
    },
    // 通用按键嗒
    button(t, o) {
      const R = rt(o), vel = vv(o), v = V(sfxBus), T = (d) => t + d / R, F = (f) => f * R;
      nzHit(v, t, 0.45 * vel, 0.02, 'bandpass', F(1900), 1.4);
      const g = v.g(0); envG(g, t, 0.22 * vel, 0.001, 0.03);
      v.o('sine', F(950), t, g);
      v.keep(T(0.1)); v.done();
    },
    // 金身上桌：清亮叮（高频正弦+非谐泛音）
    goldLand(t, o) {
      const R = rt(o), vel = vv(o), v = V(sfxBus), T = (d) => t + d / R, F = (f) => f * R;
      nzHit(v, t, 0.18 * vel, 0.015, 'highpass', F(5000), 0.7);
      bellS(v, t, F(1480), 0.42 * vel, 0.75);
      v.keep(T(0.9)); v.done();
    },
    // 奖池轨道推进：五声上行 blip + 噪声 riser
    railFill(t, o) {
      const R = rt(o), vel = vv(o), v = V(sfxBus), T = (d) => t + d / R, F = (f) => f * R;
      [72, 74, 76, 79, 81, 84].forEach((m, i) => blip(v, T(i * 0.055), F(midi2f(m)), 0.26 * vel, 0.07));
      const g = v.g(0);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.10 * vel, T(0.3));
      g.gain.exponentialRampToValueAtTime(0.0001, T(0.42));
      const bp = v.f('bandpass', F(500), 1.2, g);
      bp.frequency.setValueAtTime(F(500), t);
      bp.frequency.exponentialRampToValueAtTime(Math.max(F(3200), 1), T(0.35));
      v.n(t, bp);
      v.keep(T(0.5)); v.done();
    },
    // 计分滴答：opts.rate 变调（计分加速）
    countTick(t, o) {
      const R = rt(o), vel = vv(o), v = V(sfxBus), T = (d) => t + d / R, F = (f) => f * R;
      const g = v.g(0); envG(g, t, 0.35 * vel, 0.001, 0.022);
      const lp = v.f('lowpass', 7000, 0.7, g);
      v.o('square', F(1750), t, lp);
      nzHit(v, t, 0.12 * vel, 0.012, 'highpass', F(4500), 0.7);
      v.keep(T(0.06)); v.done();
    },
    // 中奖和弦闪：五声和弦轻拨 + E6 星光
    wayWin(t, o) {
      const R = rt(o), vel = vv(o), v = V(sfxBus), T = (d) => t + d / R, F = (f) => f * R;
      [72, 76, 79, 84].forEach((m, i) => pluckS(v, T(i * 0.02), F(midi2f(m)), 0.30 * vel, 0.4));
      bellS(v, T(0.09), F(midi2f(88)), 0.12 * vel, 0.35);
      v.keep(T(0.6)); v.done();
    },
    // 小赢 jingle ~0.8s：C5 E5 G5 C6 琶音 + 镲
    winSmall(t, o) {
      const R = rt(o), vel = vv(o), v = V(sfxBus), T = (d) => t + d / R, F = (f) => f * R;
      [72, 76, 79, 84].forEach((m, i) => pluckS(v, T(i * 0.08), F(midi2f(m)), (0.26 + i * 0.04) * vel, 0.5));
      cymbal(v, T(0.24), 0.10 * vel, 0.4);
      v.keep(T(0.9)); v.done();
    },
    // 中赢 jingle ~1.5s：五音琶音 + 和弦垫 + 镲 + 起鼓
    winMid(t, o) {
      const R = rt(o), vel = vv(o), v = V(sfxBus), T = (d) => t + d / R, F = (f) => f * R;
      boom(v, t, 0.25 * vel, F(150), F(60), 0.25);
      [72, 76, 79, 84, 88].forEach((m, i) => pluckS(v, T(0.06 + i * 0.07), F(midi2f(m)), (0.24 + i * 0.03) * vel, 0.5));
      chordPad(v, T(0.44), [84, 88, 91], 0.6, 0.10 * vel);
      cymbal(v, T(0.44), 0.12 * vel, 0.55);
      v.keep(T(1.4)); v.done();
    },
    // 大赢 jingle ~2.5s：定音鼓+八度速弹+和弦垫+高音收尾
    winBig(t, o) {
      const R = rt(o), vel = vv(o), v = V(sfxBus), T = (d) => t + d / R, F = (f) => f * R;
      boom(v, t, 0.5 * vel, F(120), F(42), 0.5);
      timpRoll(v, t, 0.45, 0.18 * vel);
      [72, 74, 76, 79, 81, 84, 86, 88].forEach((m, i) =>
        pluckS(v, T(0.10 + i * 0.085), F(midi2f(m)), (0.22 + i * 0.018) * vel, 0.45));
      chordPad(v, T(0.85), [72, 79, 84, 88], 0.9, 0.12 * vel);
      cymbal(v, T(0.85), 0.14 * vel, 0.7);
      bellS(v, T(1.75), F(midi2f(93)), 0.20 * vel, 0.7);
      cymbal(v, T(1.75), 0.10 * vel, 0.5);
      v.keep(T(2.5)); v.done();
    },
    // 奖池巨奖 ~4s：定音鼓滚 + 号角 fanfare + 五声速弹 + 金币雨 + 终止大叮
    jackpot(t, o) {
      const R = rt(o), vel = vv(o), v = V(sfxBus), T = (d) => t + d / R, F = (f) => f * R;
      timpRoll(v, t, 1.1, 0.30 * vel);
      boom(v, t, 0.6 * vel, F(110), F(40), 0.6);
      horn(v, T(0.02), [60, 64, 67], 0.16, 0.30 * vel);
      horn(v, T(0.22), [60, 64, 67], 0.16, 0.32 * vel);
      horn(v, T(0.42), [60, 64, 67], 0.16, 0.34 * vel);
      horn(v, T(0.66), [67, 72, 74], 0.30, 0.36 * vel);
      horn(v, T(1.10), [72, 76, 79, 84], 1.15, 0.34 * vel);
      [72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96].forEach((m, i) =>
        pluckS(v, T(1.15 + i * 0.06), F(midi2f(m)), (0.16 + i * 0.012) * vel, 0.35));
      chordPad(v, T(2.05), [72, 76, 79, 84], 1.1, 0.13 * vel);
      cymbal(v, T(1.10), 0.16 * vel, 0.9);
      for (let i = 0; i < 22; i++)
        coinPing(v, T(1.4 + Math.random() * 2.2), (0.05 + Math.random() * 0.05) * vel, F(2200 * Math.pow(2, Math.random() * 1.8)));
      shimmer(v, T(1.4), 2.3, 0.05 * vel);
      bellS(v, T(3.0), F(1568), 0.30 * vel, 1.0);
      boom(v, T(3.0), 0.4 * vel, F(90), F(38), 0.7);
      cymbal(v, T(3.0), 0.14 * vel, 0.9);
      v.keep(T(4.1)); v.done();
    },
    // 免费局触发：金锣（低频非谐泛音长衰减）+ 噪声涌起（欢呼感）
    freeTrigger(t, o) {
      const R = rt(o), vel = vv(o), v = V(sfxBus), T = (d) => t + d / R, F = (f) => f * R;
      const f0 = F(98);
      const g = v.g(0);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.5 * vel, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, T(3.8));
      [[1, 1], [1.52, 0.55], [2.24, 0.42], [2.92, 0.30], [3.64, 0.22], [4.51, 0.14], [5.83, 0.09]]
        .forEach(([ra, a]) => {
          const gi = v.g(a, g);
          const p = v.o('sine', f0 * ra * (1 + (Math.random() - 0.5) * 0.01), t, gi);
          p.frequency.exponentialRampToValueAtTime(Math.max(f0 * ra * 0.985, 1), T(3.5));
        });
      nzHit(v, t, 0.5 * vel, 0.09, 'bandpass', F(420), 1.0);
      boom(v, t, 0.5 * vel, F(60), F(36), 1.0);
      v.wet(g, 0.35);
      const cg = v.g(0);                              // 人群欢呼感：中频噪声涌起+微颤
      cg.gain.setValueAtTime(0.0001, T(0.15));
      cg.gain.linearRampToValueAtTime(0.09 * vel, T(0.7));
      cg.gain.exponentialRampToValueAtTime(0.0001, T(2.8));
      const bp = v.f('bandpass', F(950), 0.6, cg);
      v.n(T(0.15), bp);
      v.lfo(6, T(0.4), cg.gain, 0.02);
      v.keep(T(4.0)); v.done();
    },
    // 翻币：啪嗒 + 上滑 + 短叮
    pickReveal(t, o) {
      const R = rt(o), vel = vv(o), v = V(sfxBus), T = (d) => t + d / R, F = (f) => f * R;
      nzHit(v, t, 0.4 * vel, 0.018, 'highpass', F(3800), 0.8);
      const g = v.g(0); envG(g, T(0.02), 0.2 * vel, 0.002, 0.05);
      const s = v.o('sine', F(620), T(0.02), g);
      s.frequency.exponentialRampToValueAtTime(F(980), T(0.06));
      bellS(v, T(0.06), F(2093), 0.20 * vel, 0.28);
      v.keep(T(0.5)); v.done();
    },
    // 选奖凑齐：双音叮咚（E6 → C6 钟声）
    pickMatch(t, o) {
      const R = rt(o), vel = vv(o), v = V(sfxBus), T = (d) => t + d / R, F = (f) => f * R;
      bellS(v, t, F(1319), 0.30 * vel, 0.30);
      bellS(v, T(0.14), F(1047), 0.34 * vel, 0.5);
      v.keep(T(0.8)); v.done();
    },
    // 金币雨：密集随机高频叮 + 高频沙沙幕
    coinRain(t, o) {
      const R = rt(o), vel = vv(o), v = V(sfxBus), T = (d) => t + d / R, F = (f) => f * R;
      for (let i = 0; i < 26; i++)
        coinPing(v, T(Math.random() * 1.25), (0.06 + Math.random() * 0.06) * vel, F(2400 * Math.pow(2, Math.random() * 1.7)));
      shimmer(v, t, 1.4, 0.045 * vel);
      v.keep(T(1.6)); v.done();
    },
    // 补币流入：颤动噪声带下扫 + 散落叮 + 落定
    refill(t, o) {
      const R = rt(o), vel = vv(o), v = V(sfxBus), T = (d) => t + d / R, F = (f) => f * R;
      const g = v.g(0);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.16 * vel, T(0.08));
      g.gain.setValueAtTime(0.16 * vel, T(0.5));
      g.gain.exponentialRampToValueAtTime(0.0001, T(0.78));
      const bp = v.f('bandpass', F(4200), 1.1, g);
      bp.frequency.setValueAtTime(F(4200), t);
      bp.frequency.exponentialRampToValueAtTime(Math.max(F(1400), 1), T(0.7));
      v.n(t, bp);
      v.lfo(17, t, g.gain, 0.07 * vel);
      for (let i = 0; i < 10; i++)
        coinPing(v, T(0.05 + Math.random() * 0.6), (0.05 + Math.random() * 0.04) * vel, F(2600 * Math.pow(2, Math.random() * 1.5)));
      boom(v, T(0.72), 0.25 * vel, F(170), F(70), 0.18);
      v.keep(T(1.0)); v.done();
    },
    // 无效操作：低鸣双降音
    error(t, o) {
      const R = rt(o), vel = vv(o), v = V(sfxBus), T = (d) => t + d / R, F = (f) => f * R;
      const lp = v.f('lowpass', F(650), 0.7);
      const g = v.g(0, lp);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.4 * vel, t + 0.012);
      g.gain.setValueAtTime(0.4 * vel, T(0.10));
      g.gain.exponentialRampToValueAtTime(0.0001, T(0.16));
      const s1 = v.o('sawtooth', F(196), t, lp);
      s1.frequency.exponentialRampToValueAtTime(Math.max(F(165), 1), T(0.14));
      const g2 = v.g(0, lp);
      g2.gain.setValueAtTime(0.0001, T(0.20));
      g2.gain.linearRampToValueAtTime(0.4 * vel, T(0.21));
      g2.gain.setValueAtTime(0.4 * vel, T(0.30));
      g2.gain.exponentialRampToValueAtTime(0.0001, T(0.40));
      const s2 = v.o('sawtooth', F(175), T(0.20), lp);
      s2.frequency.exponentialRampToValueAtTime(Math.max(F(130), 1), T(0.38));
      v.keep(T(0.5)); v.done();
    }
  };

  /* ------------------------------ 引擎基建 ------------------------------ */
  function makeNoise(sec) {
    const rate = ctx.sampleRate, len = (sec * rate) | 0;
    const b = ctx.createBuffer(1, len, rate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function makeIR(sec, decay) {                      // 噪声指数衰减立体声 IR
    const rate = ctx.sampleRate, len = (sec * rate) | 0;
    const buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
  function onVis() {                                 // 页面隐藏自动停 BGM，恢复显示后续播
    if (!ctx) return;
    if (document.hidden) {
      if (loops.bgm && loops.bgm.playing) { bgmWanted = true; stopLoop('bgm'); }
    } else {
      if (bgmWanted) {
        bgmWanted = false;
        if (ctx.state === 'suspended') { try { ctx.resume(); } catch (_) {} }
        startLoop('bgm');
      }
    }
  }
  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 20; comp.ratio.value = 5;
    comp.attack.value = 0.004; comp.release.value = 0.24;
    master = ctx.createGain(); master.gain.value = vols.master;
    comp.connect(master); master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = vols.sfx; sfxBus.connect(comp);
    bgmBus = ctx.createGain(); bgmBus.gain.value = 0.5;      // BGM 单独 ×0.5，不喧宾
    bgmVol = ctx.createGain(); bgmVol.gain.value = vols.bgm;
    duckGain = ctx.createGain(); duckGain.gain.value = 1;
    bgmFade = ctx.createGain(); bgmFade.gain.value = 0;      // 循环淡入淡出
    bgmBus.connect(bgmVol); bgmVol.connect(duckGain); duckGain.connect(bgmFade); bgmFade.connect(comp);
    revSend = ctx.createGain(); revSend.gain.value = 1;
    const cv = ctx.createConvolver(); cv.buffer = makeIR(1.8, 2.4);
    const rv = ctx.createGain(); rv.gain.value = 0.30;
    revSend.connect(cv); cv.connect(rv); rv.connect(comp);
    noiseBuf = makeNoise(1.5);
    if (!visBound && typeof document !== 'undefined' && document.addEventListener) {
      visBound = true;
      document.addEventListener('visibilitychange', onVis);
    }
    flushOverrides();
    return ctx;
  }

  /* ------------------------------ 覆盖音效 ------------------------------ */
  function dataURLToAB(url) {
    const i = url.indexOf(',');
    const b64 = i >= 0 ? url.slice(i + 1) : url;
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let j = 0; j < bin.length; j++) u8[j] = bin.charCodeAt(j);
    return u8.buffer;
  }
  function decodeUrl(url, cb) {                      // 兼容回调式与 Promise 式
    let ab;
    try { ab = dataURLToAB(url); } catch (e) { cb(e); return; }
    let settled = false;
    const ok = (b) => { if (!settled) { settled = true; cb(null, b); } };
    const bad = (e) => { if (!settled) { settled = true; cb(e || new Error('decodeAudioData failed')); } };
    try {
      const p = ctx.decodeAudioData(ab, ok, bad);
      if (p && typeof p.then === 'function') p.then(ok).catch(bad);
    } catch (e) { bad(e); }
  }
  function flushOverrides() {
    if (!ctx) return;
    for (const k of Object.keys(ovPending)) {
      if (ovFailed[k]) { delete ovPending[k]; continue; }
      decodeUrl(ovPending[k], (err, buf) => {
        if (err || !buf) {
          ovFailed[k] = 1; delete ovBuf[k];
          console.warn('[DF.AUDIO] 音效覆盖解码失败，回落合成:', k, err);
        } else ovBuf[k] = buf;
        delete ovPending[k];
      });
    }
  }
  function applyOverrides(map) {
    if (!map) return;
    for (const k in map) {
      if (NAMES.indexOf(k) < 0) continue;
      const url = map[k];
      if (!url || typeof url !== 'string') continue;
      ovPending[k] = url; delete ovFailed[k]; delete ovBuf[k];
    }
    if (ctx) flushOverrides();                       // ctx 未建则推迟到 unlock 时解码
  }
  const getOv = (name) => ovBuf[name] || null;
  function playBuf(buf, opts, t) {
    const src = ctx.createBufferSource(); src.buffer = buf;
    src.playbackRate.value = opts.rate > 0 ? opts.rate : 1;
    const g = ctx.createGain(); g.gain.value = opts.volume != null ? clamp01(opts.volume) : 1;
    src.connect(g); g.connect(sfxBus);
    src.start(t);
    src.onended = () => { try { src.disconnect(); g.disconnect(); } catch (_) {} };
  }

  /* ------------------------------ 公开接口 ------------------------------ */
  function unlock() {                                // 幂等；首次手势调用
    ensureCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended' && ctx.resume) { try { ctx.resume(); } catch (_) {} }
  }
  function play(name, opts) {
    opts = opts || {};
    if (LOOP_CUES[name]) { startLoop(name); return; } // 循环型防御性转发
    ensureCtx(); if (!ctx) return;
    if (ctx.state !== 'running') { try { ctx.resume(); } catch (_) {} }
    if (ctx.state !== 'running') return;             // 未解锁不排队，避免手势后爆音
    const t = now() + 0.02;
    const buf = getOv(name);
    if (buf) { playBuf(buf, opts, t); return; }
    const fn = SYNTH[name];
    if (!fn) return;
    try { fn(t, opts); } catch (e) { console.warn('[DF.AUDIO] 合成失败:', name, e); }
  }
  function duck(ms) {                                // BGM 闪避后自动恢复
    if (!ctx || !duckGain) return;
    const g = duckGain.gain, t = now(), d = Math.max(50, +ms || 800) / 1000;
    holdParam(g);
    g.linearRampToValueAtTime(0.12, t + 0.08);
    g.setValueAtTime(0.12, t + d);
    g.linearRampToValueAtTime(1, t + d + 0.45);
  }
  function setMasterVolume(v) { vols.master = clamp01(v); if (master) master.gain.setTargetAtTime(vols.master, now(), 0.03); }
  function setBGMVolume(v) { vols.bgm = clamp01(v); if (bgmVol) bgmVol.gain.setTargetAtTime(vols.bgm, now(), 0.03); }
  function setSFXVolume(v) { vols.sfx = clamp01(v); if (sfxBus) sfxBus.gain.setTargetAtTime(vols.sfx, now(), 0.03); }

  return { unlock, play, startLoop, stopLoop, duck, setBGMVolume, setSFXVolume, setMasterVolume, applyOverrides, names: NAMES };
})();
