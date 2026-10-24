(function (root) {
  'use strict';

  var doc = root.document;
  var layer = null;
  var canvas = null;
  var context = null;
  var textLayer = null;
  var particles = [];
  var messages = [];
  var frame = 0;
  var lastTime = 0;
  var width = 0;
  var height = 0;
  var shakeAnimation = null;
  var motionQuery = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reducedMotion = !!(motionQuery && motionQuery.matches);
  var palettes = {
    draw: ['#7dd3fc', '#e0f2fe', '#60a5fa'],
    summon: ['#fbbf24', '#fef3c7', '#f97316'],
    spell: ['#c084fc', '#f5d0fe', '#818cf8'],
    trap: ['#fb7185', '#fecdd3', '#a855f7'],
    attack: ['#fb923c', '#fef08a', '#ef4444'],
    damage: ['#ef4444', '#fca5a5', '#f97316'],
    destroy: ['#94a3b8', '#e2e8f0', '#f97316'],
    phase: ['#34d399', '#a7f3d0', '#38bdf8'],
    win: ['#fde047', '#fbbf24', '#f9a8d4', '#a78bfa'],
    click: ['#e2e8f0', '#94a3b8']
  };

  function isMobile() {
    return width <= 600 || (root.matchMedia && root.matchMedia('(pointer: coarse)').matches);
  }

  function resize() {
    if (!canvas || !context) return;
    width = Math.max(1, root.innerWidth || doc.documentElement.clientWidth || 1);
    height = Math.max(1, root.innerHeight || doc.documentElement.clientHeight || 1);
    var ratio = Math.min(root.devicePixelRatio || 1, isMobile() ? 1.5 : 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function ensureLayer() {
    if (layer && layer.parentNode) return true;
    if (!doc || !doc.createElement) return false;
    var parent = doc.body || doc.documentElement;
    if (!parent) return false;

    layer = doc.createElement('div');
    layer.setAttribute('aria-hidden', 'true');
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:2147483000;';

    canvas = doc.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
    layer.appendChild(canvas);
    context = canvas.getContext('2d');

    textLayer = doc.createElement('div');
    textLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    layer.appendChild(textLayer);
    parent.appendChild(layer);
    resize();
    root.addEventListener('resize', resize, { passive: true });
    return true;
  }

  function centerOf(element) {
    var x = width / 2 || (root.innerWidth || 0) / 2;
    var y = height / 2 || (root.innerHeight || 0) / 2;
    if (element && typeof element.getBoundingClientRect === 'function') {
      var rect = element.getBoundingClientRect();
      if (rect && isFinite(rect.left) && isFinite(rect.top)) {
        x = rect.left + (rect.width || 0) / 2;
        y = rect.top + (rect.height || 0) / 2;
      }
    }
    return { x: x, y: y };
  }

  function requestFrame(callback) {
    return (root.requestAnimationFrame || function (fn) {
      return root.setTimeout(function () { fn(Date.now()); }, 16);
    })(callback);
  }

  function animate(now) {
    frame = 0;
    if (!context || reducedMotion) {
      particles.length = 0;
      return;
    }
    var delta = Math.min(0.034, Math.max(0.001, (now - lastTime) / 1000));
    lastTime = now;
    context.clearRect(0, 0, width, height);

    for (var i = particles.length - 1; i >= 0; i -= 1) {
      var particle = particles[i];
      particle.life -= delta;
      if (particle.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      particle.vy += particle.gravity * delta;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.rotation += particle.spin * delta;
      var alpha = Math.min(1, particle.life / particle.fade);
      context.globalAlpha = alpha;
      context.fillStyle = particle.color;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size * Math.min(1, particle.life * 5), 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    if (particles.length) frame = requestFrame(animate);
    else context.clearRect(0, 0, width, height);
  }

  function burst(kind, element) {
    try {
      if (reducedMotion || !ensureLayer() || !context) return;
      var point = centerOf(element);
      var colors = palettes[kind] || palettes.click;
      var mobile = isMobile();
      var limit = mobile ? 56 : 96;
      var count = mobile ? 10 : 18;
      if (kind === 'win') count = mobile ? 20 : 34;
      else if (kind === 'destroy' || kind === 'summon') count = mobile ? 14 : 24;
      count = Math.min(count, limit - particles.length);

      for (var i = 0; i < count; i += 1) {
        var angle = Math.random() * Math.PI * 2;
        var speed = (kind === 'win' ? 100 : 65) + Math.random() * (mobile ? 110 : 170);
        var life = 0.4 + Math.random() * 0.45;
        particles.push({
          x: point.x,
          y: point.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - (kind === 'win' ? 80 : 20),
          gravity: kind === 'spell' || kind === 'draw' ? 35 : 210,
          size: 1.5 + Math.random() * (mobile ? 2.5 : 3.5),
          color: colors[Math.floor(Math.random() * colors.length)],
          life: life,
          fade: life * 0.7,
          rotation: 0,
          spin: 0
        });
      }
      if (particles.length && !frame) {
        lastTime = (root.performance && root.performance.now ? root.performance.now() : Date.now());
        frame = requestFrame(animate);
      }
    } catch (error) {}
  }

  function removeMessage(item) {
    var index = messages.indexOf(item);
    if (index !== -1) messages.splice(index, 1);
    if (item.timer) root.clearTimeout(item.timer);
    if (item.node.parentNode) item.node.parentNode.removeChild(item.node);
  }

  function text(message, element) {
    try {
      if ((message === undefined || message === null || message === '') || !ensureLayer()) return;
      var point = centerOf(element);
      var node = doc.createElement('div');
      node.textContent = String(message);
      node.style.cssText = 'position:absolute;left:' + Math.max(12, Math.min(width - 12, point.x)) + 'px;top:' + Math.max(24, Math.min(height - 24, point.y)) + 'px;transform:translate(-50%,-50%);max-width:88vw;padding:.35em .65em;border-radius:.5em;background:rgba(15,23,42,.82);color:#fff;font:700 clamp(16px,4vw,28px)/1.2 system-ui,-apple-system,sans-serif;text-align:center;white-space:normal;overflow-wrap:anywhere;box-sizing:border-box;';
      textLayer.appendChild(node);
      var item = { node: node, timer: 0, animation: null };
      messages.push(item);
      while (messages.length > 6) removeMessage(messages[0]);

      if (!reducedMotion && typeof node.animate === 'function') {
        item.animation = node.animate([
          { opacity: 0, transform: 'translate(-50%,-35%) scale(.85)' },
          { opacity: 1, transform: 'translate(-50%,-65%) scale(1)', offset: 0.22 },
          { opacity: 1, transform: 'translate(-50%,-100%) scale(1)', offset: 0.72 },
          { opacity: 0, transform: 'translate(-50%,-145%) scale(.96)' }
        ], { duration: 1100, easing: 'ease-out', fill: 'forwards' });
      }
      item.timer = root.setTimeout(function () { removeMessage(item); }, reducedMotion ? 1300 : 1150);
    } catch (error) {}
  }

  function shake() {
    try {
      if (reducedMotion || !doc) return;
      var target = doc.getElementById('duelScreen') || doc.body;
      if (!target || typeof target.animate !== 'function') return;
      if (shakeAnimation) shakeAnimation.cancel();
      var distance = isMobile() ? 4 : 7;
      shakeAnimation = target.animate([
        { transform: 'translate(0,0)' },
        { transform: 'translate(' + -distance + 'px,2px)' },
        { transform: 'translate(' + distance + 'px,-2px)' },
        { transform: 'translate(' + -distance * 0.6 + 'px,0)' },
        { transform: 'translate(' + distance * 0.6 + 'px,1px)' },
        { transform: 'translate(0,0)' }
      ], { duration: 280, easing: 'ease-out' });
    } catch (error) {}
  }

  function motionChanged(event) {
    reducedMotion = event.matches;
    if (!reducedMotion) return;
    particles.length = 0;
    if (frame && root.cancelAnimationFrame) root.cancelAnimationFrame(frame);
    frame = 0;
    if (context) context.clearRect(0, 0, width, height);
    if (shakeAnimation) shakeAnimation.cancel();
  }

  if (motionQuery) {
    if (motionQuery.addEventListener) motionQuery.addEventListener('change', motionChanged);
    else if (motionQuery.addListener) motionQuery.addListener(motionChanged);
  }

  var api = { burst: burst, text: text, shake: shake };
  root.DuelFx = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
