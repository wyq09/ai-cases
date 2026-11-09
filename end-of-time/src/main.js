/* 时间的尽头 · 主循环与宇宙状态机：黄昏 → 暮年 → 残响 → 余烬 → 终末之始 → 终焉 */
(function () {
  var canvas = document.getElementById('stage');
  var veil = document.getElementById('veil');

  var scene = EOT.createScene(canvas);
  if (!scene) {
    document.getElementById('nogl').hidden = false;
    veil.classList.add('gone');
    return;
  }
  var audio = EOT.createAudio();

  var S = {
    flow: 1, entropy: 0.18, infall: 1, sand: 0.8, bloom: 1, disk: 1,
    orbit: true, quality: 'high', theme: 'gold',
    paused: false, terminal: false,
    simTime: 0, kick: 1, cooldown: 0, pendingEra: 0,
    collapses: 0, effEntropy: 0.18
  };

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  var ui = EOT.createUI(S, scene, audio, {
    onCollapse: collapse,
    onReset: reset,
    onExport: exportPNG
  });

  scene.on.onTap = collapse;
  scene.on.onFirstGesture = function () { audio.ensure(); ui.syncSound(); };
  scene.on.onDist = ui.syncDist;

  function collapse() {
    if (S.terminal || S.cooldown > 0) return;
    if (S.paused) ui.setPaused(false);
    audio.ensure();
    S.cooldown = 3;
    S.kick = 5.5;
    S.pendingEra = 1.15;
    scene.collapseFx();
    audio.collapse();
  }

  function applyEra() {
    S.collapses = Math.min(S.collapses + 1, 5);
    if (S.collapses >= 5 && !S.terminal) {
      S.terminal = true;
      ui.setTerminal(true);
    }
    ui.updateEra();
  }

  function reset() {
    S.collapses = 0;
    S.terminal = false;
    S.simTime = 0;
    S.kick = 1;
    S.cooldown = 0;
    S.pendingEra = 0;
    ui.setPaused(false);
    ui.setTerminal(false);
    scene.resetFx();
  }

  function exportPNG() {
    var url = scene.exportPNG();
    var a = document.createElement('a');
    a.href = url;
    a.download = '时间的尽头-纪元' + (S.collapses + 1) + '.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // 小屏默认中档画质
  if (window.innerWidth < 760) {
    S.quality = 'mid';
    document.getElementById('selQuality').value = 'mid';
    scene.setQuality('mid');
  }

  var last = performance.now();
  var veilLifted = false;
  var frameCount = 0;
  function frame(now) {
    frameCount++;
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    S.kick += (1 - S.kick) * Math.min(1, dt * 0.9);
    if (S.cooldown > 0) S.cooldown -= dt;
    if (S.pendingEra > 0) {
      S.pendingEra -= dt;
      if (S.pendingEra <= 0) applyEra();
    }

    var flowEff = S.paused ? 0 : S.flow * S.kick * (S.terminal ? 0.05 : 1);
    S.simTime += dt * flowEff;
    S.effEntropy = S.terminal ? 1 : clamp01(S.entropy + Math.min(S.collapses * 0.16, 0.82));

    scene.update(dt, {
      simTime: S.simTime, entropy: S.effEntropy, infall: S.infall,
      sand: S.sand, bloom: S.bloom, disk: S.disk,
      orbit: S.orbit, terminal: S.terminal
    });
    audio.update(flowEff, S.simTime, S.terminal);
    ui.tick(now);

    if (!veilLifted) {
      veilLifted = true;
      setTimeout(function () { veil.classList.add('gone'); }, 1400);
      setTimeout(function () { veil.remove(); }, 3400);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // 自动化验收钩子
  window.__EOT = {
    S: S,
    collapse: collapse,
    reset: reset,
    cam: scene.getCam,
    fps: scene.getFPS,
    exportPNG: scene.exportPNG,
    frames: function () { return frameCount; },
    audioState: function () { return { started: audio.started, muted: audio.muted }; },
    version: '2.0.0'
  };
})();