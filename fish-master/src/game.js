/* 捕鱼达人 · 游戏状态机与交互 */
(function () {
  'use strict';
  window.FM = window.FM || {};
  var CFG = window.FM.CONFIG;
  var LOGIC = window.FM.LOGIC;

  var SAVE_KEY = 'fm_deep_sea_v1';
  var ROUND_TIME = 120;

  function Game(scene) {
    this.scene = scene;
    this.UI = window.FM.UI;
    this.state = 'start';
    this.coins = CFG.startCoins;
    this.score = 0;
    this.streak = 0;
    this.bomb = 0;
    this.power = 1;
    this.muted = false;
    this.timeLeft = ROUND_TIME;
    this.fireTimer = 0;
    this.spawnTimer = 0;
    this.lastCatch = -99;
    this.firing = false;
    this.lastFrame = performance.now();
    this.totalCatches = 0;
    this.best = 0;
    this.load();

    this.buildTimer();
    this.bindInput();
    this.bindHandlers();
    this.seedFish(11);
    this.syncUI();
    this.UI.showStart(true);
  }

  Game.prototype.buildTimer = function () {
    var el = document.createElement('div');
    el.id = 'fm-timer';
    el.style.cssText = 'position:absolute;top:14px;left:50%;transform:translateX(-50%);' +
      'pointer-events:none;font:600 15px/1.2 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;' +
      'letter-spacing:.14em;color:#dff8ff;background:rgba(6,28,42,.46);border:1px solid rgba(120,225,235,.28);' +
      'border-radius:999px;padding:7px 16px;backdrop-filter:blur(7px);text-shadow:0 0 12px rgba(90,230,220,.45);z-index:6;';
    el.textContent = '02:00';
    var hud = document.getElementById('hud');
    (hud || document.body).appendChild(el);
    this.timerEl = el;
  };

  Game.prototype.bindHandlers = function () {
    var self = this;
    var UI = this.UI;
    if (!UI || !UI.init) return;
    UI.init({
      onPower: function (p) { self.setPower(p); },
      onBomb: function () { self.useBomb(); },
      onMute: function (m) { self.setMuted(m); },
      onPause: function (p) { self.pause(p); },
      onStart: function () { self.start(); },
      onRestart: function () { self.restart(); },
      onHelp: function (open) { if (window.FM.AUDIO && window.FM.AUDIO.play) window.FM.AUDIO.play('click'); }
    });
  };

  Game.prototype.bindInput = function () {
    var self = this;
    var canvas = this.scene.canvas;
    canvas.addEventListener('pointermove', function (e) {
      var p = self.scene.screenToWorld(e.clientX, e.clientY);
      self.scene.setAim(p.x, p.y);
    });
    canvas.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      var A = window.FM.AUDIO;
      if (A && A.unlock) A.unlock();
      var p = self.scene.screenToWorld(e.clientX, e.clientY);
      self.scene.setAim(p.x, p.y);
      self.firing = true;
      if (self.state === 'playing') self.fire();
      if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (err) {} }
    });
    var stop = function () { self.firing = false; };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && !window.__FM_NO_AUTO_PAUSE) { stop(); if (self.state === 'playing') self.pause(true); }
    });
    window.addEventListener('keydown', function (e) {
      if (e.code === 'Space') {
        e.preventDefault();
        if (self.state === 'start') self.start();
        else if (self.state === 'playing') self.fire();
      } else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        if (self.state === 'playing') self.pause(true);
        else if (self.state === 'paused') self.pause(false);
      } else if (e.key >= '1' && e.key <= '5') {
        self.setPower(parseInt(e.key, 10));
      } else if (e.key === 'b' || e.key === 'B') {
        self.useBomb();
      }
    });
    window.addEventListener('resize', function () { self.scene.resize(); });
  };

  Game.prototype.load = function () {
    try {
      var d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (d && typeof d === 'object') {
        this.best = Number(d.best) || 0;
        this.coins = Number(d.coins) || CFG.startCoins;
        this.totalCatches = Number(d.totalCatches) || 0;
        this.muted = !!d.muted;
      }
    } catch (e) {}
    var A = window.FM.AUDIO;
    if (A && A.setMuted) A.setMuted(this.muted);
  };

  Game.prototype.save = function () {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        best: this.best, coins: Math.round(this.coins),
        totalCatches: this.totalCatches, muted: this.muted
      }));
    } catch (e) {}
  };

  Game.prototype.reset = function () {
    this.score = 0; this.streak = 0; this.bomb = 0; this.timeLeft = ROUND_TIME;
    this.lastCatch = -99; this.fireTimer = 0; this.spawnTimer = 0;
    this.scene.clearFish();
    this.seedFish(11);
    this.syncUI();
  };

  Game.prototype.start = function () {
    var A = window.FM.AUDIO;
    if (A) { if (A.unlock) A.unlock(); if (A.play) A.play('start'); if (A.startLoop) A.startLoop('ambient'); }
    this.state = 'playing';
    this.UI.showStart(false);
    this.UI.showPause(false);
    this.UI.showResult(null);
    this.reset();
  };

  Game.prototype.restart = function () {
    this.start();
  };

  Game.prototype.pause = function (on) {
    if (this.state !== 'playing' && this.state !== 'paused') return;
    this.state = on ? 'paused' : 'playing';
    this.firing = false;
    this.UI.showPause(on);
    var A = window.FM.AUDIO;
    if (A) {
      if (on && A.stopAllLoops) A.stopAllLoops();
      if (!on && A.startLoop) A.startLoop('ambient');
    }
  };

  Game.prototype.setMuted = function (m) {
    this.muted = !!m;
    var A = window.FM.AUDIO;
    if (A && A.setMuted) A.setMuted(this.muted);
    this.save();
  };

  Game.prototype.setPower = function (p) {
    p = Math.max(1, Math.min(5, Number(p) || 1));
    if (p === this.power) return;
    this.power = p;
    this.UI.setPower(p);
    this.UI.showToast('炮台功率 ×' + p + ' · 每发 ' + CFG.shotCost[p - 1] + ' 金');
    var A = window.FM.AUDIO;
    if (A && A.play) A.play('click');
  };

  Game.prototype.fire = function () {
    if (this.state !== 'playing' || this.fireTimer > 0) return false;
    var hint = document.querySelector('.hint');
    if (hint) hint.style.opacity = '0';
    var cost = CFG.shotCost[this.power - 1];
    this.coins -= Math.min(this.coins, cost);
    this.fireTimer = CFG.fireCd[this.power - 1];
    var self = this;
    this.scene.fireNet(this.power, function (info) { self.onCatch(info); });
    this.syncUI();
    return true;
  };

  Game.prototype.onCatch = function (info) {
    var now = performance.now() / 1000;
    if (now - this.lastCatch > CFG.comboWindow) this.streak = 0;
    this.streak += 1;
    this.lastCatch = now;
    var mult = LOGIC.comboMultiplier(Math.max(0, this.streak - 1));
    var gained = LOGIC.coinsFor(info.spec.value, mult);
    var pts = Math.round(info.spec.value * 10 * mult);
    this.coins += gained;
    this.score += pts;
    this.totalCatches += 1;
    this.bomb = LOGIC.bombCharge(this.bomb);
    if (this.score > this.best) this.best = this.score;
    this.UI.setCoins(Math.round(this.coins));
    this.UI.setScore(this.score);
    this.UI.setCombo(this.streak);
    this.UI.setBombCharge(this.bomb / CFG.bombMax);
    this.UI.showCatch('+' + gained, info.spec.name + (mult > 1 ? '  ×' + mult : ''));
    if (this.streak === 4 || this.streak === 8 || this.streak === 12) {
      this.UI.showToast('连击 ×' + this.streak + ' · 倍率 ' + mult);
      var A = window.FM.AUDIO;
      if (A && A.play) A.play('combo');
    }
    if (this.bomb >= CFG.bombMax) this.UI.showToast('能量已满 · 按 B 或点炸弹清屏！');
    this.save();
  };

  Game.prototype.useBomb = function () {
    if (this.state !== 'playing' || this.bomb < CFG.bombMax) {
      if (this.state === 'playing') this.UI.showToast('炸弹能量未满');
      return false;
    }
    this.bomb = 0;
    var self = this;
    this.scene.bomb(function (info) { self.onCatch(info); });
    this.UI.setBombCharge(0);
    this.UI.showToast('深水冲击波！');
    this.save();
    return true;
  };

  Game.prototype.seedFish = function (n) {
    for (var i = 0; i < n; i++) {
      var key = LOGIC.pickSpecies(Math.random);
      this.scene.spawnFish(key);
    }
  };

  Game.prototype.spawnWave = function () {
    var key = LOGIC.pickSpecies(Math.random);
    var big = (key === 'whale' || key === 'angler');
    var count = big ? 1 : (2 + Math.floor(Math.random() * 3));
    var dir = Math.random() < 0.5 ? 1 : -1;
    var b = this.scene.bounds();
    var baseY = b.bottom + 3 + Math.random() * (b.h - 6);
    for (var i = 0; i < count; i++) {
      this.scene.spawnFish(key, {
        dir: dir, y: baseY + (i - count / 2) * 1.1 + (Math.random() - 0.5) * 0.6,
        x: (dir > 0 ? b.left - 2 : b.right + 2) - dir * i * (1.7 + Math.random()),
        z: -5 + Math.random() * 9
      });
    }
  };

  Game.prototype.syncUI = function () {
    this.UI.setCoins(Math.round(this.coins));
    this.UI.setScore(this.score);
    this.UI.setCombo(this.streak);
    this.UI.setPower(this.power);
    this.UI.setBombCharge(this.bomb / CFG.bombMax);
    this.UI.setFishCount(this.scene.fish.length);
  };

  Game.prototype.finish = function () {
    this.state = 'result';
    this.firing = false;
    this.save();
    var A = window.FM.AUDIO;
    if (A && A.play) A.play('levelup');
    this.UI.showResult({
      title: '本局结束',
      score: this.score, coins: Math.round(this.coins), best: this.best,
      body: '捕获 ' + this.totalCatches + ' 条鱼 · 历史最佳 ' + this.best
    });
  };

  Game.prototype.tick = function (now) {
    var dt = Math.min(0.05, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    if (this.state === 'playing') {
      this.scene.update(dt);
      this.fireTimer = Math.max(0, this.fireTimer - dt);
      if (this.firing && this.fireTimer <= 0) this.fire();

      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.scene.fish.length < CFG.maxFish) {
        this.spawnWave();
        this.spawnTimer = CFG.spawnInterval * (0.75 + Math.random() * 0.7);
      }
      // 温和回金，避免弹尽粮绝
      this.coins = Math.min(99999, this.coins + dt * 0.7);
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.timeLeft = 0; this.finish(); }
      var sec = Math.ceil(this.timeLeft);
      this.timerEl.textContent = String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
      if (this.streak > 0 && now / 1000 - this.lastCatch > CFG.comboWindow) {
        this.streak = 0; this.UI.setCombo(0);
      }
      this.syncUI();
    }
    this.scene.render();
    if (this.UI && this.UI.update) this.UI.update();
  };

  Game.prototype.run = function () {
    var self = this;
    function frame(now) {
      try { self.tick(now); } catch (e) {
        if (window.__errs) window.__errs.push('TICK ' + (e && e.stack || e));
        console.error(e);
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  };

  window.FM.Game = Game;
})();
