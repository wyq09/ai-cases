(() => {
  'use strict';
  const LHP = (window.__LHP = window.__LHP || {});

  function createView() {
    const cam = new THREE.OrthographicCamera(0, 1920, 0, 1080, -10, 10);
    const view = {
      x0: 0,
      y0: 0,
      w: 1920,
      h: 1080,
      x1: 1920,
      y1: 1080,
      scale: 1,
      ppu: 1,
      cam,
      resize(pw, ph) {
        const sc = Math.min(pw / 1920, ph / 1080) || 1;
        view.scale = sc;
        view.ppu = sc;
        view.w = pw / sc;
        view.h = ph / sc;
        view.x0 = (1920 - view.w) * 0.5;
        view.y0 = (1080 - view.h) * 0.5;
        view.x1 = view.x0 + view.w;
        view.y1 = view.y0 + view.h;
        cam.left = view.x0;
        cam.right = view.x1;
        cam.top = view.y0;
        cam.bottom = view.y1;
        cam.updateProjectionMatrix();
      },
      toClip(x, y) {
        return [((x - view.x0) / view.w) * 2 - 1, 1 - ((y - view.y0) / view.h) * 2];
      },
      fromClip(cx, cy) {
        return [view.x0 + (cx * 0.5 + 0.5) * view.w, view.y0 + (0.5 - cy * 0.5) * view.h];
      },
    };
    return view;
  }

  class Overlay {
    constructor(gfx, view) {
      this.gfx = gfx;
      this.view = view;
      this.scene = new THREE.Scene();
    }
    add(...items) {
      for (const item of items) {
        if (item) this.scene.add(item.mesh || item);
      }
      return items[0];
    }
    remove(...items) {
      for (const item of items) {
        if (item) this.scene.remove(item.mesh || item);
      }
      return this;
    }
    render(target) {
      const r = this.gfx.r;
      r.setRenderTarget(target);
      r.render(this.scene, this.view.cam);
    }
  }

  function createNullAudio() {
    return {
      quiet: false,
      unlock() {},
      mute() {},
      emit() {},
      hit() {},
      param() {},
      update() {},
    };
  }

  const FALLBACK_FADE = {
    dur: 0.7,
    create(ctx) {
      const p = ctx.gfx.pass(
        `
        uniform sampler2D tA, tB;
        uniform float p;
        void main(){
          o = mix(texture(tA, vUv), texture(tB, vUv), smoothstep(0.0, 1.0, p));
        }
        `,
        { tA: null, tB: null, p: 0 }
      );
      return {
        render({ A, B, p: prog, out }) {
          p.u.tA.value = A.texture;
          p.u.tB.value = B.texture;
          p.u.p.value = prog;
          p.render(out);
        },
      };
    },
  };

  async function createDeck({
    canvas,
    scenes = [],
    transitions = {},
    makeAudio = null,
    headless = false,
    qs = new URLSearchParams(),
  }) {
    const { clamp, damp, ease } = LHP.math;
    const gfx = LHP.createGfx(canvas, { headless });
    const view = createView();
    let ppu = 1;
    const type = LHP.createType(gfx, () => ppu);
    const audio = (makeAudio ? makeAudio() : null) || createNullAudio();

    const mouse = { x: 0, y: 0, tx: 0, ty: 0, px: 960, py: 540, down: false };
    const snapshots = {};
    const thumbs = {};

    const ctx = {
      THREE,
      gfx,
      view,
      type,
      audio,
      mouse,
      SelectBox: LHP.SelectBox,
      Rect2D: LHP.Rect2D,
      rectOf: LHP.rectOf,
      SELECT: '#2b5cff',
      headless,
      overlay: () => new Overlay(gfx, view),
      text: (str, opts) => type.block(str, opts),
      sfx: (name, opts) => {
        if (!audio.quiet) audio.hit(name, opts);
      },
      snapshots,
      thumbs,
      deck: null,
    };

    const rtA = gfx.target({});
    const rtB = gfx.target({});
    const rtOut = gfx.target({});

    class Runner {
      constructor(def, index) {
        this.def = def;
        this.i = index;
        this.inst = null;
        this.ready = false;
        this.parked = false;
        this._warm = false;
        this._initPromise = null;
        const beats = def.beats || [{ dur: 1 }];
        const n = beats.length;
        this.s = {
          t: 0,
          dt: 0,
          beat: 0,
          p: new Array(n).fill(0),
          _since: new Array(n).fill(0),
          n,
          enter: 1,
          exit: 0,
          dir: 1,
          mouse,
          view,
          q: 1,
          at: (b) => {
            if (b < 0 || b >= n) return 0;
            return this.s.p[b] * (beats[b].dur || 1);
          },
          k: (b, t0, t1, easeFn = ease.io3) => {
            if (b < 0 || b >= n) return 0;
            const curT = this.s.p[b] * (beats[b].dur || 1);
            const u = clamp((curT - t0) / Math.max(1e-4, t1 - t0), 0, 1);
            return easeFn(u);
          },
          since: (b) => (b >= 0 && b < n ? this.s._since[b] : 0),
        };
      }

      anchor(s) {
        return this.inst && this.inst.anchor ? this.inst.anchor(s || this.s) : null;
      }

      async init() {
        if (this.ready) return;
        if (this._initPromise) return this._initPromise;
        this._initPromise = (async () => {
          gfx.owner = this;
          let inst;
          try {
            inst = this.def.create(ctx);
            const maybePromise = inst.init && inst.init();
            gfx.owner = null;
            if (maybePromise) await maybePromise;
          } finally {
            gfx.owner = null;
          }
          this.inst = inst;
          this.ready = true;
        })();
        return this._initPromise;
      }

      park(p) {
        if (!this.ready || headless || this.parked === p) return;
        this.parked = p;
        gfx.park(this, p);
        if (!p && this.inst && this.inst.resize) this.inst.resize();
      }

      reset(beat = 0, reverse = false) {
        const s = this.s;
        s.t = 0;
        s.beat = clamp(beat, 0, s.n - 1);
        s.enter = 1;
        s.exit = 0;
        for (let i = 0; i < s.n; i++) {
          s.p[i] = reverse && i <= s.beat ? 1 : 0;
          s._since[i] = reverse && i <= s.beat ? 30 : 0;
        }
      }

      step(dt) {
        const s = this.s;
        const beats = this.def.beats || [{ dur: 1 }];
        s.dt = dt;
        s.t += dt;
        for (let i = 0; i < s.n; i++) {
          const dur = Math.max(1e-3, beats[i].dur || 1);
          if (i <= s.beat) {
            const delay = beats[i].delay || 0;
            s._since[i] += dt;
            if (s._since[i] >= delay) {
              s.p[i] = Math.min(1, s.p[i] + (dt / dur) * (i < s.beat ? 3 : 1));
            }
          } else {
            s._since[i] = 0;
            s.p[i] = Math.max(0, s.p[i] - (dt / dur) * 2.4);
          }
        }
        if (this.inst && this.inst.update) this.inst.update(s);
      }

      render(target) {
        if (this.inst && this.inst.render) this.inst.render(target, this.s);
      }
    }

    const runners = scenes.map((def, i) => new Runner(def, i));
    let cur = -1;
    let trans = null;
    let blackVal = 0;
    let blackTarget = 0;
    let autoPlay = false;
    let muted = false;
    let elapsed = 0;
    let lastRaf = 0;
    let quality = 1;
    let paused = false;
    let queuedAdvance = 0;

    const listeners = {};
    const emitEvent = (ev, data) => {
      (listeners[ev] || []).forEach((fn) => fn(data));
    };

    // Transition registry
    const transMap = { fade: { def: transitions.fade || FALLBACK_FADE, inst: null, parked: false } };
    for (const key in transitions) {
      transMap[key] = { def: transitions[key], inst: null, parked: false };
    }

    function getTransition(name) {
      const entry = transMap[name] || transMap.fade;
      if (!entry.inst) {
        gfx.owner = entry;
        try {
          entry.inst = entry.def.create(ctx);
        } finally {
          gfx.owner = null;
        }
      }
      if (entry.parked) {
        gfx.park(entry, false);
        entry.parked = false;
      }
      return entry;
    }

    function parkUnusedTransitions() {
      if (headless) return;
      const keep = new Set([cur, cur + 1].map((idx) => scenes[idx] && scenes[idx].enterWith));
      for (const key in transMap) {
        if (key === 'fade') continue;
        const entry = transMap[key];
        if (entry.inst && !entry.parked && !keep.has(key) && !(trans && trans.name === key)) {
          gfx.park(entry, true);
          entry.parked = true;
        }
      }
    }

    // HUD bottom-right page / deep-time counter
    const hudOverlay = new Overlay(gfx, view);
    const hudText = type.block('1', {
      x: 1860,
      y: 1026,
      size: 22,
      font: 'arial',
      align: 'right',
      valign: 'middle',
      color: '#7f7f7f',
      order: 200,
    });
    hudOverlay.add(hudText);

    let lastHudTxt = null;
    let hudRise = 1;
    let lastHudFont = '';
    let lastHudColor = '';

    function getHudSpec(runner) {
      const hud = runner.def.hud || {};
      const beatDef = (runner.def.beats || [])[runner.s.beat] || {};
      const isLightSlide = runner.def.id === 'boring' || runner.def.id === 'ending';
      const instPage =
        runner.inst && runner.inst.page != null
          ? typeof runner.inst.page === 'function'
            ? runner.inst.page(runner.s)
            : runner.inst.page
          : null;
      const defPage =
        runner.def && runner.def.page != null
          ? typeof runner.def.page === 'function'
            ? runner.def.page(runner.s)
            : runner.def.page
          : null;
      const rawTxt = instPage ?? defPage ?? beatDef.page ?? '';
      const defaultColor = isLightSlide ? '#7f7f7f' : '#d8e0ee';
      const defaultFont = isLightSlide ? 'arial' : 'monoMed';
      const color = (typeof hud.color === 'function' ? hud.color(runner.s) : hud.color) || defaultColor;
      const font = (typeof hud.font === 'function' ? hud.font(runner.s) : hud.font) || defaultFont;
      const alpha = typeof hud.alpha === 'function' ? hud.alpha(runner.s) : hud.alpha ?? 0.78;
      return { txt: String(rawTxt), color, font, alpha };
    }

    function renderHud(target) {
      const runner = trans && trans.p > 0.5 ? runners[trans.to] : runners[cur];
      if (!runner || !runner.ready) return;
      const spec = getHudSpec(runner);
      if (spec.font !== lastHudFont || spec.color !== lastHudColor) {
        lastHudFont = spec.font;
        lastHudColor = spec.color;
        hudText.style({ font: spec.font, color: spec.color });
      }
      if (spec.txt !== lastHudTxt) {
        lastHudTxt = spec.txt;
        hudText.set(spec.txt || ' ');
        hudRise = spec.font === 'arial' ? 1 : 0;
      }
      const tx = view.x1 - 56;
      const ty = view.y1 - 48;
      if (hudText.x !== tx || hudText.y !== ty) {
        hudText.x = tx;
        hudText.y = ty;
      }
      hudRise = headless || paused ? 1 : Math.min(1, hudRise + 0.055);
      hudText.alpha = spec.alpha;
      hudText.animate((g, d) => {
        const e = ease.out4(clamp(hudRise * 1.6 - g.n * 0.055, 0, 1));
        d.dy = (1 - e) * g.size * 1.1;
        d.clip = 1;
      });
      hudOverlay.render(target);
    }

    // Snapshot & thumbnail capture
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 320;
    thumbCanvas.height = 180;
    const thumbCtx = thumbCanvas.getContext('2d');
    let thumbReadRT = null;
    const thumbBuf = new Uint8Array(320 * 180 * 4);

    function captureSnapshot(idx, captureThumb = true) {
      const runner = runners[idx];
      if (!runner || !runner.ready) return;
      const id = runner.def.id;
      let snap = snapshots[id];
      if (!snap) {
        snap = snapshots[id] = gfx.target({ w: 640, h: 360, type: THREE.UnsignedByteType });
      }
      runner.render(rtA);
      gfx.copy(rtA, snap);

      if (captureThumb) {
        try {
          if (!thumbReadRT) {
            thumbReadRT = gfx.target({ w: 320, h: 180, type: THREE.UnsignedByteType });
          }
          gfx.copy(snap, thumbReadRT);
          gfx.r.readRenderTargetPixels(thumbReadRT, 0, 0, 320, 180, thumbBuf);
          const img = thumbCtx.createImageData(320, 180);
          for (let y = 0; y < 180; y++) {
            const srcRow = (179 - y) * 320 * 4;
            const dstRow = y * 320 * 4;
            img.data.set(thumbBuf.subarray(srcRow, srcRow + 320 * 4), dstRow);
          }
          thumbCtx.putImageData(img, 0, 0);
          thumbs[id] = thumbCanvas.toDataURL('image/jpeg', 0.78);
        } catch {
          // Ignore readback errors in restricted contexts
        }
      }
    }

    function finishTransition() {
      if (!trans) return;
      const { from, to } = trans;
      runners[from].s.exit = 0;
      runners[to].s.enter = 1;
      if (runners[from].inst && runners[from].inst.exit) runners[from].inst.exit(runners[from].s);
      cur = to;
      trans = null;
      emitEvent('move');
      manageNeighbors();
      if (queuedAdvance) {
        queuedAdvance = 0;
        deck.advance();
      }
    }

    function manageNeighbors() {
      runners.forEach((r, idx) => r.park(Math.abs(idx - cur) > 1));
      parkUnusedTransitions();
      const nextScene = scenes[cur + 1];
      if (nextScene && transMap[nextScene.enterWith]) {
        getTransition(nextScene.enterWith);
      }
      if (!headless) {
        for (const offset of [1, 2]) {
          const r = runners[cur + offset];
          if (r && !r._warm) {
            setTimeout(() => warmScene(r), 300 * offset);
          }
        }
      }
    }

    async function warmScene(runner) {
      if (runner._warm || paused) return;
      runner._warm = true;
      audio.quiet = true;
      try {
        await runner.init();
        runner.park(false);
        const s = runner.s;
        for (let b = 0; b < s.n; b++) {
          for (const mid of [true, false]) {
            runner.reset(b, true);
            if (mid) s.p[b] = 0.5;
            if (b === 0 && mid && runner.inst.enter) runner.inst.enter(s);
            runner.step(1e-4);
            runner.render(rtB);
          }
        }
        // Capture a real thumbnail at a representative mid-scene frame
        const repBeat = Math.min(s.n - 1, runner.def.id === 'boring' ? 0 : Math.floor(s.n * 0.5));
        runner.reset(repBeat, true);
        s.p[repBeat] = 0.85;
        runner.step(0.016);
        captureSnapshot(runner.i, true);

        const T = getTransition(runner.def.enterWith || 'fade');
        runner.reset(0);
        s.enter = 0.5;
        runner.step(1e-4);
        if (T.inst.start) T.inst.start();
        for (const pv of [0.2, 0.5, 0.8]) {
          T.inst.render({ A: rtB, B: rtB, p: pv, out: rtOut, a: runner, b: runner, sa: s, sb: s, time: 0 });
        }
      } catch (err) {
        console.warn('warm', runner.def.id, err && err.message);
      } finally {
        runner.reset(0);
        audio.quiet = false;
      }
    }

    function resize() {
      const cw = canvas.clientWidth || window.innerWidth || 1280;
      const ch = canvas.clientHeight || window.innerHeight || 720;
      let dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (qs.get('px')) dpr = Math.max(0.5, +qs.get('px') || 1);
      let pw = cw * dpr;
      let ph = ch * dpr;
      const cap = Math.min(1, Math.sqrt((2560 * 1600) / Math.max(1, pw * ph)));
      pw = Math.max(2, Math.round(pw * cap));
      ph = Math.max(2, Math.round(ph * cap));
      view.resize(pw, ph);
      ppu = view.scale;
      gfx.resize(Math.max(2, Math.round(pw * quality)), Math.max(2, Math.round(ph * quality)), pw, ph);
      gfx.q = quality;
      type.refresh();
      for (const r of runners) {
        if (r.ready && r.inst && r.inst.resize) r.inst.resize();
      }
    }

    function stepFrame(dt) {
      elapsed += dt;
      const md = damp(5, dt);
      mouse.x += (mouse.tx - mouse.x) * md;
      mouse.y += (mouse.ty - mouse.y) * md;
      blackVal += (blackTarget - blackVal) * damp(6, dt);

      if (trans) {
        trans.t += dt * trans.speed;
        trans.p = clamp(trans.t / Math.max(1e-3, trans.dur), 0, 1);
        const rFrom = runners[trans.from];
        const rTo = runners[trans.to];
        const prog = trans.reverse ? 1 - trans.p : trans.p;
        const rA = trans.reverse ? rTo : rFrom;
        const rB = trans.reverse ? rFrom : rTo;
        rA.s.exit = trans.linked ? prog : 0;
        rB.s.enter = trans.linked ? prog : 1;
        rFrom.s.q = rTo.s.q = quality;
        rFrom.step(dt);
        rTo.step(dt);
        if (trans.p >= 1) finishTransition();
      } else if (cur >= 0) {
        const r = runners[cur];
        r.s.q = quality;
        r.step(dt);
        if (autoPlay) {
          const beatDef = r.def.beats[r.s.beat] || { dur: 1 };
          const waitDur = (beatDef.delay || 0) + (beatDef.dur || 1) + (beatDef.hold ?? 3);
          if (r.s._since[r.s.beat] > waitDur) {
            if (cur === runners.length - 1 && r.s.beat === r.s.n - 1) {
              deck.setAuto(false);
            } else {
              deck.advance();
            }
          }
        }
      }

      if (cur >= 0) {
        const activeIdx = trans ? trans.to : cur;
        audio.update(dt, {
          scene: scenes[activeIdx] ? scenes[activeIdx].id : '',
          beat: runners[activeIdx] ? runners[activeIdx].s.beat : 0,
        });
      }
    }

    function drawFrame() {
      if (cur < 0) return;
      let finalRT = rtA;
      if (trans) {
        const rFrom = runners[trans.from];
        const rTo = runners[trans.to];
        const rev = trans.reverse;
        const rA = rev ? rTo : rFrom;
        const rB = rev ? rFrom : rTo;
        rA.render(rtA);
        rB.render(rtB);
        trans.T.inst.render({
          A: rtA,
          B: rtB,
          p: rev ? 1 - trans.p : trans.p,
          out: rtOut,
          a: rA,
          b: rB,
          sa: rA.s,
          sb: rB.s,
          time: elapsed,
        });
        finalRT = rtOut;
      } else {
        runners[cur].render(rtA);
      }
      renderHud(finalRT);
      gfx.present(finalRT, elapsed, blackVal);
    }

    // Dynamic Resolution Scaling (DRS)
    let smoothMs = 0;
    let drsTimer = 0;
    let fastTimer = 0;
    const DRS_LEVELS = [1, 0.84, 0.7, 0.58];
    const drsDrops = [0, 0, 0, 0];

    function updateDrs(frameMs) {
      if (headless || document.hidden || frameMs > 200) return;
      smoothMs = smoothMs * 0.94 + frameMs * 0.06;
      drsTimer += frameMs;
      fastTimer = frameMs < 18.5 ? fastTimer + frameMs : Math.max(0, fastTimer - frameMs * 12);
      const idx = DRS_LEVELS.indexOf(quality);
      if (smoothMs > 21 && drsTimer > 1200) {
        if (idx < DRS_LEVELS.length - 1) {
          drsDrops[idx]++;
          quality = DRS_LEVELS[idx + 1];
          drsTimer = 0;
          fastTimer = 0;
          smoothMs = 14;
          resize();
        }
      } else if (idx > 0 && fastTimer > 5000 && drsTimer > 6000 && drsDrops[idx - 1] < 3 && !trans) {
        quality = DRS_LEVELS[idx - 1];
        drsTimer = 0;
        resize();
      }
    }

    function rafLoop(now) {
      requestAnimationFrame(rafLoop);
      if (paused) return;
      const ms = now - lastRaf;
      lastRaf = now;
      updateDrs(ms);
      stepFrame(Math.min(0.05, Math.max(0, ms / 1000)));
      drawFrame();
    }

    const deck = {
      ctx,
      gfx,
      view,
      type,
      audio,
      R: runners,
      scenes,
      get cur() {
        return cur;
      },
      get trans() {
        return trans;
      },
      get auto() {
        return autoPlay;
      },
      get muted() {
        return muted;
      },
      get black() {
        return blackTarget > 0.5;
      },
      on(ev, fn) {
        (listeners[ev] = listeners[ev] || []).push(fn);
        return deck;
      },
      advance() {
        queuedAdvance = 0;
        if (trans) {
          trans.speed = 3.5;
          queuedAdvance = 1;
          return;
        }
        if (cur < 0) return;
        const r = runners[cur];
        if (r.s.beat < r.s.n - 1) {
          r.s.beat++;
          r.s.dir = 1;
          audio.emit('beat', { scene: r.def.id, beat: r.s.beat });
          emitEvent('move');
          if (paused) {
            r.step(0.016);
            drawFrame();
          }
        } else if (cur < runners.length - 1) {
          deck.go(cur + 1, { with: scenes[cur + 1].enterWith || 'fade' });
        }
      },
      back() {
        if (trans) {
          trans.speed = 3.5;
          return;
        }
        if (cur < 0) return;
        const r = runners[cur];
        r.s.dir = -1;
        if (r.s.beat > 0) {
          r.s.beat--;
          audio.emit('back', {});
          emitEvent('move');
          if (paused) {
            r.step(0.016);
            drawFrame();
          }
        } else if (cur > 0) {
          deck.go(cur - 1, {
            with: scenes[cur].enterWith || 'fade',
            reverse: true,
            beat: scenes[cur - 1].beats.length - 1,
          });
        }
      },
      async go(index, { with: transName = 'fade', reverse = false, beat = 0 } = {}) {
        if (index === cur || index < 0 || index >= runners.length) return;
        const targetRunner = runners[index];
        await targetRunner.init();
        targetRunner.park(false);
        targetRunner.reset(beat, reverse);
        if (!reverse && beat > 0) {
          for (let i = 0; i < beat; i++) {
            targetRunner.s.p[i] = 1;
            targetRunner.s._since[i] = 30;
          }
        }
        if (targetRunner.inst && targetRunner.inst.enter) targetRunner.inst.enter(targetRunner.s);
        const T = getTransition(transName);

        if (cur < 0) {
          cur = index;
          emitEvent('move');
          manageNeighbors();
          if (paused) {
            targetRunner.step(0.016);
            drawFrame();
          }
          return;
        }

        try {
          captureSnapshot(cur, true);
        } catch {}

        if (paused) {
          if (runners[cur].inst && runners[cur].inst.exit) runners[cur].inst.exit(runners[cur].s);
          cur = index;
          trans = null;
          emitEvent('move');
          manageNeighbors();
          targetRunner.step(0.016);
          drawFrame();
          return;
        }

        trans = {
          from: cur,
          to: index,
          T,
          name: transName,
          p: 0,
          t: 0,
          dur: (T.def.dur || 0.7) * (reverse ? 0.55 : 1),
          speed: 1,
          reverse,
          linked: transName !== 'fade',
        };
        if (T.inst.start) T.inst.start();
        audio.emit('transition', {
          name: transName,
          from: scenes[cur].id,
          to: scenes[index].id,
          dur: trans.dur,
          reverse,
        });
        emitEvent('move');
      },
      jump(idOrIndex, beat = 0) {
        const idx =
          typeof idOrIndex === 'number'
            ? idOrIndex
            : scenes.findIndex((sc) => sc.id === idOrIndex);
        if (idx < 0 || idx >= runners.length) return;
        if (idx === cur && !trans) {
          const r = runners[idx];
          r.reset(beat);
          for (let i = 0; i < beat; i++) {
            r.s.p[i] = 1;
            r.s._since[i] = 30;
          }
          if (r.inst && r.inst.enter) r.inst.enter(r.s);
          emitEvent('move');
          if (paused) {
            r.step(0.016);
            drawFrame();
          }
          return;
        }
        if (trans) finishTransition();
        deck.go(idx, { with: 'fade', beat });
      },
      setAuto(v) {
        autoPlay = !!v;
        emitEvent('auto', autoPlay);
      },
      toggleBlack() {
        blackTarget = blackTarget ? 0 : 1;
        if (paused) {
          blackVal = blackTarget;
          drawFrame();
        }
        emitEvent('black', blackTarget > 0.5);
      },
      mute(v) {
        muted = v != null ? !!v : !muted;
        audio.mute(muted);
        emitEvent('mute', muted);
      },
      info() {
        const idx = trans ? trans.to : cur;
        const r = runners[idx] || runners[0];
        if (!r) return { scene: '', index: 0, beat: 0, title: '', notes: '' };
        const notesArr = r.def.notes || [];
        return {
          scene: r.def.id,
          index: r.i,
          beat: r.s.beat,
          title: r.def.title || r.def.id,
          notes: notesArr[r.s.beat] || '',
        };
      },
      async warmAll(onProgress) {
        resize();
        for (let i = 0; i < runners.length; i++) {
          await new Promise((res) => setTimeout(res, 0));
          await warmScene(runners[i]);
          gfx.gl.finish();
          if (i > 1) runners[i].park(true);
          if (onProgress) onProgress((i + 1) / runners.length);
          await new Promise((res) => requestAnimationFrame(res));
        }
      },
      async start(id, beat = 0) {
        resize();
        const idx = Math.max(
          0,
          scenes.findIndex((sc) => sc.id === id)
        );
        const r = runners[idx];
        await r.init();
        r.park(false);
        r.reset(beat);
        for (let i = 0; i < beat; i++) {
          r.s.p[i] = 1;
          r.s._since[i] = 30;
        }
        if (r.inst && r.inst.enter) r.inst.enter(r.s);
        cur = idx;
        emitEvent('move');
        manageNeighbors();
        if (headless) {
          paused = true;
          r.step(0.016);
          drawFrame();
        } else {
          lastRaf = performance.now();
          requestAnimationFrame(rafLoop);
        }
      },
      test: {
        resize,
        draw: drawFrame,
        async seek(id, beat = 0, t = 0, { mx = 0, my = 0 } = {}) {
          paused = true;
          const idx =
            typeof id === 'number' ? id : scenes.findIndex((sc) => sc.id === id);
          if (idx < 0 || idx >= runners.length) throw new Error(`Unknown scene: ${id}`);
          const r = runners[idx];
          await r.init();
          r.park(false);
          trans = null;
          cur = idx;
          r.reset(0);
          r.s.enter = 1;
          r.s.exit = 0;
          blackVal = blackTarget;
          mouse.x = mouse.tx = mx;
          mouse.y = mouse.ty = my;
          if (r.inst && r.inst.enter) r.inst.enter(r.s);
          const stepDt = 1 / 60;
          const clampedBeat = clamp(beat, 0, r.s.n - 1);
          for (let b = 0; b <= clampedBeat; b++) {
            r.s.beat = b;
            const bDef = r.def.beats[b] || { dur: 1 };
            const totalT =
              b < clampedBeat
                ? (bDef.delay || 0) + (bDef.dur || 1) + Math.min(1.5, bDef.hold ?? 1.5)
                : Math.max(0, t);
            if (totalT <= 0) {
              elapsed += stepDt;
              r.step(1e-4);
            } else {
              for (let acc = 0; acc < totalT; acc += stepDt) {
                const dt = Math.min(stepDt, totalT - acc);
                elapsed += dt;
                r.step(dt);
              }
            }
          }
          emitEvent('move');
          drawFrame();
        },
        async trans(id, p = 0.5) {
          paused = true;
          const idx =
            typeof id === 'number' ? id : scenes.findIndex((sc) => sc.id === id);
          if (idx <= 0 || idx >= runners.length) throw new Error(`Invalid transition target: ${id}`);
          const prevRunner = runners[idx - 1];
          const nextRunner = runners[idx];
          await prevRunner.init();
          await nextRunner.init();
          prevRunner.park(false);
          nextRunner.park(false);
          const prevLast = prevRunner.def.beats.length - 1;
          await deck.test.seek(
            scenes[idx - 1].id,
            prevLast,
            (prevRunner.def.beats[prevLast].dur || 1) + 1
          );
          cur = idx - 1;
          try {
            captureSnapshot(cur, false);
          } catch {}
          const transName = scenes[idx].enterWith || 'fade';
          const T = getTransition(transName);
          nextRunner.reset(0);
          if (nextRunner.inst && nextRunner.inst.enter) nextRunner.inst.enter(nextRunner.s);
          trans = {
            from: idx - 1,
            to: idx,
            T,
            name: transName,
            p: 0,
            t: 0,
            dur: T.def.dur || 0.7,
            speed: 1,
            reverse: false,
            linked: transName !== 'fade',
          };
          if (T.inst.start) T.inst.start();
          const stepDt = 1 / 60;
          const targetP = clamp(p, 0, 1);
          if (targetP <= 0) {
            stepFrame(1e-4);
          } else {
            while (trans && trans.p < targetP - 1e-6) {
              stepFrame(Math.min(stepDt, (targetP - trans.p) * trans.dur + 1e-5));
            }
          }
          drawFrame();
          trans = null;
        },
        perf(id, n = 20) {
          const idx =
            typeof id === 'number' ? id : scenes.findIndex((sc) => sc.id === id);
          const r = runners[idx];
          if (!r || !r.ready) return 0;
          return gfx.time(() => {
            r.s.t += 1 / 60;
            r.render(rtA);
            gfx.present(rtA, 0, 0);
          }, n);
        },
      },
    };

    ctx.deck = deck;

    // Input & Resize listeners
    window.addEventListener('resize', resize);

    const toStageCoords = (ev) => {
      const rect = canvas.getBoundingClientRect();
      const rw = Math.max(1, rect.width);
      const rh = Math.max(1, rect.height);
      const cx = ((ev.clientX - rect.left) / rw) * 2 - 1;
      const cy = 1 - ((ev.clientY - rect.top) / rh) * 2;
      return [cx, cy, ...view.fromClip(cx, cy)];
    };

    window.addEventListener('pointermove', (ev) => {
      const [cx, cy, px, py] = toStageCoords(ev);
      mouse.tx = cx;
      mouse.ty = cy;
      mouse.px = px;
      mouse.py = py;
      if (cur >= 0 && runners[cur].inst && runners[cur].inst.pointer) {
        runners[cur].inst.pointer('move', px, py, runners[cur].s);
        if (paused && mouse.down) {
          runners[cur].step(0.016);
          drawFrame();
        }
      }
    });

    let downX = 0;
    let downY = 0;
    let downTime = 0;
    let sceneCaptured = false;

    canvas.addEventListener('pointerdown', (ev) => {
      const [, , px, py] = toStageCoords(ev);
      mouse.down = true;
      mouse.px = px;
      mouse.py = py;
      downX = ev.clientX;
      downY = ev.clientY;
      downTime = performance.now();
      sceneCaptured = !!(
        cur >= 0 &&
        runners[cur].inst &&
        runners[cur].inst.pointer &&
        runners[cur].inst.pointer('down', px, py, runners[cur].s)
      );
      if (sceneCaptured && canvas.setPointerCapture) {
        try {
          canvas.setPointerCapture(ev.pointerId);
        } catch {}
      }
      audio.unlock();
    });

    canvas.addEventListener('pointerup', (ev) => {
      const [, , px, py] = toStageCoords(ev);
      mouse.down = false;
      const wasCaptured = sceneCaptured;
      sceneCaptured = false;
      if (cur >= 0 && runners[cur].inst && runners[cur].inst.pointer) {
        runners[cur].inst.pointer('up', px, py, runners[cur].s);
      }
      if (wasCaptured) return;
      const dx = ev.clientX - downX;
      const dy = ev.clientY - downY;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) deck.advance();
        else deck.back();
        return;
      }
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && performance.now() - downTime < 600) {
        if (ev.button === 2) return;
        deck.advance();
      }
    });

    canvas.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      deck.back();
    });

    return deck;
  }

  // ===== Presenter Chrome =====
  const SCENE_THEMES = {
    boring: ['#f7f8fa', '#2b5cff', '01 · 46 亿年的谎言'],
    scale: ['#0a0d16', '#f2b857', '02 · 1920 px 进度条'],
    breath: ['#081a24', '#38d39f', '03 · 第一次呼吸'],
    five: ['#180b0d', '#e54d3c', '04 · 五次清零'],
    window: ['#0d1826', '#f5c76e', '05 · 11,700 年暖廊'],
    coal: ['#14100a', '#ff9b38', '06 · 三亿年的阳光'],
    flicker: ['#0b0e14', '#d9b56a', '07 · 23:59:59.996'],
    split: ['#14161c', '#45b7d1', '08 · 两种未来'],
    zoom: ['#080a10', '#9db8ff', '09 · 你在此处'],
    ending: ['#f7f8fa', '#ff9f43', '10 · 下一格像素'],
  };

  function setupChrome(deck, scenes, headless) {
    const ui = document.getElementById('ui');
    if (!ui) return;

    const mk = (cls, html = '') => {
      const el = document.createElement('div');
      el.className = cls;
      el.innerHTML = html;
      return el;
    };

    let notesEl = null;
    let overEl = null;
    let helpEl = null;
    let popoutWin = null;
    let startTime = 0;

    const fmtElapsed = () => {
      if (!startTime) return '0:00';
      const sec = Math.floor((performance.now() - startTime) / 1000);
      return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    };

    const showToast = (msg) => {
      const el = mk('toast', msg);
      ui.append(el);
      setTimeout(() => {
        el.style.opacity = '0';
      }, 1300);
      setTimeout(() => el.remove(), 1800);
    };

    function syncNotes() {
      const info = deck.info();
      const sc = scenes[info.index] || scenes[0];
      if (!sc) return;
      const meta = `${fmtElapsed()}<br>${info.index + 1} / ${scenes.length} · ${info.beat + 1} / ${(sc.beats || []).length}`;
      if (notesEl) {
        notesEl.querySelector('p').textContent = info.notes || '（本节无演讲者备注）';
        notesEl.querySelector('.meta').innerHTML = meta;
      }
      if (popoutWin && !popoutWin.closed) {
        try {
          const d = popoutWin.document;
          const nEl = d.getElementById('n');
          const mEl = d.getElementById('m');
          const sEl = d.getElementById('s');
          if (nEl) nEl.textContent = info.notes || '（本节无演讲者备注）';
          if (mEl) mEl.innerHTML = meta;
          if (sEl) sEl.textContent = sc.title || sc.id;
        } catch {}
      }
    }

    function syncHash() {
      const info = deck.info();
      if (!info.scene) return;
      try {
        history.replaceState(null, '', '#' + info.scene + (info.beat ? '-' + (info.beat + 1) : ''));
      } catch {}
    }

    deck.on('move', () => {
      if (!startTime) startTime = performance.now();
      syncNotes();
      syncHash();
    });
    setInterval(syncNotes, 1000);

    const toggleNotes = () => {
      if (notesEl) {
        notesEl.remove();
        notesEl = null;
      } else {
        notesEl = mk('notes', '<p></p><div class="meta"></div>');
        ui.append(notesEl);
        syncNotes();
      }
    };

    const toggleOverview = () => {
      if (overEl) {
        overEl.remove();
        overEl = null;
        return;
      }
      overEl = mk('over');
      const curIdx = deck.info().index;
      scenes.forEach((sc, idx) => {
        const btn = document.createElement('button');
        const thumbUrl = deck.ctx.thumbs[sc.id];
        const theme = SCENE_THEMES[sc.id] || ['#151923', '#5c8dff', `${String(idx + 1).padStart(2, '0')} · ${sc.title}`];
        const isLight = theme[0] === '#f7f8fa';
        btn.innerHTML = `<div class="th"></div><span>${idx + 1}. ${sc.title || sc.id}</span>`;
        const th = btn.querySelector('.th');
        if (thumbUrl) {
          th.style.backgroundImage = `url(${thumbUrl})`;
        } else {
          th.style.background = `radial-gradient(circle at 75% 25%, ${theme[1]}33, transparent 58%), ${theme[0]}`;
          th.style.color = isLight ? '#1a1d24' : '#e6ecf5';
          th.innerHTML = `<div class="th-fallback"><small>${theme[2]}</small><strong>${sc.title || sc.id}</strong></div>`;
        }
        btn.setAttribute('aria-current', String(curIdx === idx));
        btn.onclick = () => {
          toggleOverview();
          deck.jump(sc.id, 0);
        };
        overEl.append(btn);
      });
      ui.append(overEl);
      const activeBtn = overEl.querySelector('[aria-current="true"]');
      if (activeBtn) activeBtn.focus();
    };

    const toggleHelp = () => {
      if (helpEl) {
        helpEl.remove();
        helpEl = null;
        return;
      }
      const rows = [
        ['下一页', '→ / 空格 / 点击'],
        ['上一页', '← / 右键'],
        ['全屏', 'F'],
        ['自动播放', 'A'],
        ['开关声音', 'M'],
        ['演讲者备注', 'N'],
        ['独立备注窗口', 'P'],
        ['所有幻灯片', 'O'],
        ['黑屏', '. / B'],
        ['快捷键帮助', '? / H'],
      ];
      helpEl = mk('help', rows.map(([k, v]) => `<b>${k}</b><span>${v}</span>`).join(''));
      ui.append(helpEl);
    };

    const openPopout = () => {
      try {
        popoutWin = window.open('', 'lhp-notes', 'width=900,height=600');
        if (!popoutWin) throw new Error('blocked');
        popoutWin.document.title = '最后半个像素 · 演讲者备注';
        popoutWin.document.body.innerHTML =
          '<style>body{margin:0;background:#101218;color:#f2f4f8;font:26px/1.6 "PingFang SC","Hiragino Sans GB","Noto Sans SC","Microsoft YaHei",system-ui,sans-serif;padding:40px;display:grid;gap:24px;align-content:start}#n{white-space:pre-line}#m,#s{color:#a4abb8;font-size:18px;font-variant-numeric:tabular-nums}</style><div id="s"></div><div id="n"></div><div id="m"></div>';
        popoutWin.document.onkeydown = onKeyDown;
        syncNotes();
      } catch {
        if (!notesEl) toggleNotes();
      }
    };

    function onKeyDown(ev) {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const k = ev.key;
      deck.audio.unlock();
      if (overEl && k !== 'Escape' && k !== 'o' && k !== 'O') return;

      if (['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'Enter'].includes(k)) {
        ev.preventDefault();
        if (!ev.repeat) deck.advance();
      } else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) {
        ev.preventDefault();
        if (!ev.repeat) deck.back();
      } else if (k === 'Home') {
        deck.jump(0, 0);
      } else if (k === 'End') {
        deck.jump(scenes.length - 1, 0);
      } else if (k === 'f' || k === 'F') {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else document.documentElement.requestFullscreen().catch(() => {});
      } else if (k === 'a' || k === 'A') {
        deck.setAuto(!deck.auto);
        showToast(deck.auto ? '已开启自动播放' : '已切换为手动模式');
      } else if (k === 'm' || k === 'M') {
        deck.mute();
        showToast(deck.muted ? '已静音' : '已开启声音');
      } else if (k === 'n' || k === 'N') {
        toggleNotes();
      } else if (k === 'p' || k === 'P') {
        openPopout();
      } else if (k === 'o' || k === 'O') {
        toggleOverview();
      } else if (k === '?' || k === 'h' || k === 'H') {
        toggleHelp();
      } else if (k === '.' || k === 'b' || k === 'B') {
        deck.toggleBlack();
      } else if (k === 'Escape') {
        if (overEl) toggleOverview();
        if (helpEl) toggleHelp();
      }
    }

    window.addEventListener('keydown', onKeyDown);

    if (!headless) {
      let idleTimer = 0;
      const poke = () => {
        document.body.classList.remove('idle');
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => document.body.classList.add('idle'), 2200);
      };
      window.addEventListener('pointermove', poke);
      poke();
    }

    window.addEventListener('hashchange', () => {
      const m = /^#([a-z0-9_-]+)(?:-(\d+))?$/i.exec(location.hash || '');
      if (!m) return;
      const targetScene = m[1];
      const targetBeat = m[2] ? Math.max(0, +m[2] - 1) : 0;
      const curInfo = deck.info();
      if (targetScene !== curInfo.scene || targetBeat !== curInfo.beat) {
        deck.jump(targetScene, targetBeat);
      }
    });
  }

  function makeFallbackScene() {
    return {
      id: 'boring',
      title: '最后半个像素',
      enterWith: 'fade',
      beats: [{ dur: 1, hold: 3, page: '1' }],
      notes: ['引擎已就绪。'],
      create(ctx) {
        const ov = ctx.overlay();
        const title = ctx.text('最后半个像素', {
          x: 960,
          y: 540,
          size: 72,
          font: 'displayBold',
          color: '#14161c',
          align: 'center',
          valign: 'middle',
        });
        ov.add(title);
        const clearPass = ctx.gfx.pass('void main(){ o = vec4(1.0, 1.0, 1.0, 1.0); }');
        return {
          update() {},
          render(target) {
            clearPass.render(target);
            ov.render(target);
          },
        };
      },
    };
  }

  async function boot() {
    const qs = new URLSearchParams(location.search);
    const headless = qs.has('headless');
    const quick = qs.has('quick');
    const canvas = document.getElementById('stage');
    if (!canvas) return;

    const allScenes = [...(LHP.scenesEarly || []), ...(LHP.scenesLate || [])];
    const scenes = allScenes.length ? allScenes : [makeFallbackScene()];
    const transitions = LHP.transitions || {};
    const makeAudio = typeof LHP.createAudio === 'function' ? LHP.createAudio : null;

    let deck;
    try {
      deck = await createDeck({ canvas, scenes, transitions, makeAudio, headless, qs });
    } catch (err) {
      console.error(err);
      const ui = document.getElementById('ui');
      if (ui) {
        const box = document.createElement('div');
        box.className = 'help';
        box.textContent = '此演示文稿需要 WebGL 2 支持。请使用最新版 Chrome、Edge、Safari 或 Firefox 打开。';
        ui.append(box);
      }
      return;
    }

    window.__deck = deck;

    if (!headless && !quick) {
      const ui = document.getElementById('ui');
      const loader = document.createElement('div');
      loader.className = 'load';
      loader.innerHTML = '<p>正在打开演示文稿 · 最后半个像素</p><div><i></i></div>';
      if (ui) ui.append(loader);
      const bar = loader.querySelector('i');
      await new Promise((res) => requestAnimationFrame(res));
      await deck.warmAll((prog) => {
        if (bar) bar.style.width = `${Math.round(prog * 100)}%`;
      });
      loader.remove();
    }

    const m = /^#([a-z0-9_-]+)(?:-(\d+))?$/i.exec(location.hash || '');
    const initId = m && scenes.some((sc) => sc.id === m[1]) ? m[1] : scenes[0].id;
    const initBeat = m && m[2] ? Math.max(0, +m[2] - 1) : 0;

    await deck.start(initId, initBeat);
    setupChrome(deck, scenes, headless);
    window.ready = true;
  }

  LHP.createDeck = createDeck;
  LHP.boot = boot;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => boot(), { once: true });
  } else {
    boot();
  }
})();
