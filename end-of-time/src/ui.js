/* 时间的尽头 · UI：控制台绑定 / HUD / 主题 / 导出 */
window.EOT = window.EOT || {};

EOT.createUI = function (S, scene, audio, hooks) {
  var $ = function (id) { return document.getElementById(id); };
  var els = {
    veil: $('veil'), subtitle: $('subtitle'), eraText: $('eraText'), eraDots: $('eraDots'),
    entropyFill: $('entropyFill'), entropyPct: $('entropyPct'), statLine: $('statLine'),
    hint: $('hintText'), hintBar: document.querySelector('.ui-hint'),
    sound: $('soundBtn'), full: $('fullBtn'),
    collapse: $('btnCollapse'), pause: $('btnPause'), reset: $('btnReset'), export: $('btnExport'),
    quality: $('selQuality'), theme: $('selTheme'), orbit: $('tglOrbit')
  };
  var ERAS = ['纪元 I · 黄昏', '纪元 II · 暮年', '纪元 III · 残响', '纪元 IV · 余烬', '纪元 V · 终末之始', '终焉 · 时间尽头'];
  var isCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  var HINT_DEFAULT = isCoarse ? '单指环视 · 双指缩放 · 轻点奇点，引发坍缩' : '拖动环视 · 滚轮缩放 · 点击奇点，引发坍缩';
  var HINT_TERMINAL = '尽头之后，唯有寂静 · 重置宇宙，再来一次';

  function fillTrack(input) {
    var min = parseFloat(input.min), max = parseFloat(input.max), v = parseFloat(input.value);
    input.style.setProperty('--fill', ((v - min) / (max - min) * 100) + '%');
  }

  function bindRange(id, outId, key, fmt, after) {
    var input = $(id), out = $(outId);
    function apply() {
      var v = parseFloat(input.value);
      S[key] = v;
      out.textContent = fmt(v);
      fillTrack(input);
      if (after) after(v);
    }
    input.addEventListener('input', apply);
    apply();
    return { input: input, out: out, fmt: fmt, apply: apply };
  }

  var ctl = {};
  ctl.flow = bindRange('rngFlow', 'oFlow', 'flow', function (v) { return v.toFixed(2) + '×'; });
  ctl.entropy = bindRange('rngEntropy', 'oEntropy', 'entropy', function (v) { return v.toFixed(2); });
  ctl.infall = bindRange('rngInfall', 'oInfall', 'infall', function (v) { return v.toFixed(2) + '×'; });
  ctl.sand = bindRange('rngSand', 'oSand', 'sand', function (v) { return Math.round(v * 100) + '%'; });
  ctl.disk = bindRange('rngDisk', 'oDisk', 'disk', function (v) { return v.toFixed(2) + '×'; });
  ctl.bloom = bindRange('rngBloom', 'oBloom', 'bloom', function (v) { return v.toFixed(2) + '×'; });
  ctl.dist = bindRange('rngDist', 'oDist', '_dist', function (v) { return String(Math.round(v)); }, function (v) { scene.setDist(v); });

  els.orbit.addEventListener('change', function () { S.orbit = els.orbit.checked; });
  els.quality.addEventListener('change', function () {
    S.quality = els.quality.value;
    scene.setQuality(S.quality);
  });
  els.theme.addEventListener('change', function () {
    S.theme = els.theme.value;
    document.body.dataset.theme = S.theme;
    scene.setTheme(S.theme);
  });

  els.collapse.addEventListener('click', hooks.onCollapse);
  els.reset.addEventListener('click', hooks.onReset);
  els.export.addEventListener('click', hooks.onExport);
  els.pause.addEventListener('click', function () { setPaused(!S.paused); });

  function setPaused(p) {
    S.paused = p;
    els.pause.textContent = p ? '继续' : '暂停';
    els.pause.setAttribute('aria-pressed', String(p));
  }

  els.sound.addEventListener('click', function () {
    audio.ensure();
    audio.setMuted(!audio.muted);
    syncSound();
  });
  function syncSound() {
    var m = audio.muted;
    els.sound.classList.toggle('muted', m);
    els.sound.setAttribute('aria-pressed', String(!m));
    els.sound.title = m ? '声音：关' : '声音：开';
  }

  els.full.addEventListener('click', function () {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(function () {});
    } else if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(function () {});
    }
  });

  window.addEventListener('keydown', function (e) {
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'TEXTAREA') return;
    if (e.code === 'Space') { e.preventDefault(); hooks.onCollapse(); }
    else if (e.code === 'KeyP') setPaused(!S.paused);
  });

  function updateEra() {
    var idx = Math.min(S.collapses, 5);
    els.eraText.textContent = ERAS[idx];
    var dots = els.eraDots.children;
    for (var i = 0; i < dots.length; i++) dots[i].classList.toggle('on', i < S.collapses);
  }

  function setTerminal(on) {
    document.body.classList.toggle('terminal', on);
    els.subtitle.textContent = on ? '时间已抵达尽头' : 'THE END OF TIME';
    els.collapse.disabled = on;
    els.collapse.innerHTML = on ? '已抵达尽头' : '<span class="btn-glyph">◉</span> 触发坍缩';
    els.reset.classList.toggle('pulse', on);
    els.hint.textContent = on ? HINT_TERMINAL : HINT_DEFAULT;
    els.hintBar.classList.toggle('faded', !on && hintFaded);
    updateEra();
  }

  var hintFaded = false;
  setTimeout(function () {
    hintFaded = true;
    if (!S.terminal) els.hintBar.classList.add('faded');
  }, 9000);

  var lastTick = 0;
  function tick(now) {
    if (now - lastTick < 250) return;
    lastTick = now;
    els.statLine.textContent = Math.round(scene.getFPS()) + ' fps · ' + Math.round(scene.getSandCount() * S.sand / 1000) + 'k 粒';
    var pct = Math.round(S.effEntropy * 100);
    els.entropyFill.style.width = pct + '%';
    els.entropyPct.textContent = pct + '%';
    if (!S.terminal) els.collapse.disabled = S.cooldown > 0;
  }

  function syncDist(v) {
    ctl.dist.input.value = String(v);
    ctl.dist.out.textContent = ctl.dist.fmt(v);
    fillTrack(ctl.dist.input);
  }

  els.hint.textContent = HINT_DEFAULT;
  updateEra();
  syncSound();

  return {
    tick: tick,
    updateEra: updateEra,
    setTerminal: setTerminal,
    setPaused: setPaused,
    syncDist: syncDist,
    syncSound: syncSound
  };
};