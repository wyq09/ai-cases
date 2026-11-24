import { clamp } from './math3d.js';
import { ENV_PRESETS } from './physics.js';

export class UIController {
  constructor(callbacks) {
    this.callbacks = callbacks;
    this.keys = new Set();
    this.touchState = {
      left: false,
      right: false,
      pedal: false,
      brake: false,
      sprint: false,
      steerAnalog: 0,
      jumpQueued: false,
      jumpHeld: false,
    };
    this.manualInputOverride = null;
    this.orbitPointers = new Map();
    this.lastPinchDist = null;
    this.orbitYawDelta = 0;
    this.orbitPitchDelta = 0;
    this.orbitZoomDelta = 0;
    this.touchMode = 'auto';
    this.toastTimer = 0;
    this.lastDomUpdate = 0;
    this.hasMoved = false;

    this.$ = {
      canvas: document.getElementById('gl-canvas'),
      btnEnvPill: document.getElementById('btn-env-pill'),
      envLabel: document.getElementById('env-label'),
      beaconCount: document.getElementById('beacon-count'),
      btnCam: document.getElementById('btn-cam'),
      btnAuto: document.getElementById('btn-auto'),
      btnLab: document.getElementById('btn-lab'),
      btnReset: document.getElementById('btn-reset'),
      btnMute: document.getElementById('btn-mute'),
      toast: document.getElementById('toast'),
      toastTag: document.getElementById('toast-tag'),
      toastTitle: document.getElementById('toast-title'),
      toastBody: document.getElementById('toast-body'),
      labDrawer: document.getElementById('lab-drawer'),
      btnLabClose: document.getElementById('btn-lab-close'),
      envMoon: document.getElementById('env-moon'),
      envEarth: document.getElementById('env-earth'),
      labG: document.getElementById('lab-g'),
      labRho: document.getElementById('lab-rho'),
      labN: document.getElementById('lab-n'),
      labTrac: document.getElementById('lab-trac'),
      labDrag: document.getElementById('lab-drag'),
      labSlope: document.getElementById('lab-slope'),
      labBestH: document.getElementById('lab-best-h'),
      labBestT: document.getElementById('lab-best-t'),
      btnTouchMode: document.getElementById('btn-touch-mode'),
      telSpeed: document.getElementById('tel-speed'),
      telAlt: document.getElementById('tel-alt'),
      telG: document.getElementById('tel-g'),
      telSlip: document.getElementById('tel-slip'),
      telSlipBox: document.getElementById('tel-slip-box'),
      telLean: document.getElementById('tel-lean'),
      desktopHint: document.getElementById('desktop-hint'),
      touchControls: document.getElementById('touch-controls'),
      steerPad: document.getElementById('steer-pad'),
      steerThumb: document.getElementById('steer-thumb'),
      btnLeft: document.getElementById('btn-left'),
      btnRight: document.getElementById('btn-right'),
      btnHop: document.getElementById('btn-hop'),
      btnSprint: document.getElementById('btn-sprint'),
      btnBrake: document.getElementById('btn-brake'),
      btnPedal: document.getElementById('btn-pedal'),
    };

    this._bindKeyboard();
    this._bindButtons();
    this._bindTouchControls();
    this._bindCanvasOrbit();
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      this.callbacks.onInteract?.();
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) {
          this.touchState.jumpQueued = true;
        }
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      if (!e.repeat) {
        if (e.code === 'KeyC') this.callbacks.onCycleCamera?.();
        if (e.code === 'KeyG') this.callbacks.onToggleEnv?.();
        if (e.code === 'KeyR') this.callbacks.onReset?.();
        if (e.code === 'KeyP') this.callbacks.onToggleAuto?.();
        if (e.code === 'KeyM') this.callbacks.onToggleMute?.();
      }
      this.keys.add(e.code);
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
    });
  }

  _bindButtons() {
    const unlock = () => this.callbacks.onInteract?.();

    this.$.btnEnvPill.addEventListener('click', () => {
      unlock();
      this.callbacks.onToggleEnv?.();
    });
    this.$.btnCam.addEventListener('click', () => {
      unlock();
      this.callbacks.onCycleCamera?.();
    });
    this.$.btnAuto.addEventListener('click', () => {
      unlock();
      this.callbacks.onToggleAuto?.();
    });
    this.$.btnLab.addEventListener('click', () => {
      unlock();
      this.toggleLabDrawer();
    });
    this.$.btnLabClose.addEventListener('click', () => {
      this.toggleLabDrawer(false);
    });
    this.$.btnReset.addEventListener('click', () => {
      unlock();
      this.callbacks.onReset?.();
    });
    this.$.btnMute.addEventListener('click', () => {
      unlock();
      this.callbacks.onToggleMute?.();
    });

    this.$.envMoon.addEventListener('click', () => {
      unlock();
      this.callbacks.onSetEnv?.('moon');
    });
    this.$.envEarth.addEventListener('click', () => {
      unlock();
      this.callbacks.onSetEnv?.('earth');
    });
    this.$.btnTouchMode.addEventListener('click', () => {
      if (this.touchMode === 'auto') this.touchMode = 'on';
      else if (this.touchMode === 'on') this.touchMode = 'off';
      else this.touchMode = 'auto';
      this._applyTouchVisibility();
    });
  }

  _applyTouchVisibility() {
    const tc = this.$.touchControls;
    tc.classList.remove('force-on', 'force-off');
    if (this.touchMode === 'on') {
      tc.classList.add('force-on');
      this.$.btnTouchMode.textContent = '开启';
    } else if (this.touchMode === 'off') {
      tc.classList.add('force-off');
      this.$.btnTouchMode.textContent = '关闭';
    } else {
      this.$.btnTouchMode.textContent = '自动';
    }
  }

  _bindTouchControls() {
    const bindHoldBtn = (el, key, onDown) => {
      const activeIds = new Set();
      const setState = (down) => {
        this.touchState[key] = down;
        el.classList.toggle('pressed', down);
      };
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.callbacks.onInteract?.();
        activeIds.add(e.pointerId);
        try {
          el.setPointerCapture(e.pointerId);
        } catch (_) {}
        setState(true);
        onDown?.();
      });
      const release = (e) => {
        activeIds.delete(e.pointerId);
        if (activeIds.size === 0) setState(false);
      };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('lostpointercapture', release);
    };

    bindHoldBtn(this.$.btnLeft, 'left');
    bindHoldBtn(this.$.btnRight, 'right');
    bindHoldBtn(this.$.btnPedal, 'pedal');
    bindHoldBtn(this.$.btnBrake, 'brake');
    bindHoldBtn(this.$.btnSprint, 'sprint');
    bindHoldBtn(this.$.btnHop, 'jumpHeld', () => {
      this.touchState.jumpQueued = true;
    });

    // Slide horizontal thumb across steer pad indicator for analog steering
    const pad = this.$.steerPad;
    let slideId = null;
    const updateAnalog = (clientX) => {
      const rect = pad.getBoundingClientRect();
      const cx = rect.left + rect.width * 0.5;
      const norm = clamp((clientX - cx) / (rect.width * 0.42), -1, 1);
      // Note: screen left (-1) = turn left (+1 steer), screen right (+1) = turn right (-1 steer)
      this.touchState.steerAnalog = -norm;
      this.$.steerThumb.style.left = `${50 + norm * 38}%`;
    };
    pad.addEventListener('pointerdown', (e) => {
      if (e.target === this.$.btnLeft || e.target === this.$.btnRight) return;
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onInteract?.();
      slideId = e.pointerId;
      try {
        pad.setPointerCapture(e.pointerId);
      } catch (_) {}
      updateAnalog(e.clientX);
    });
    pad.addEventListener('pointermove', (e) => {
      if (e.pointerId === slideId) updateAnalog(e.clientX);
    });
    const endSlide = (e) => {
      if (e.pointerId === slideId) {
        slideId = null;
        this.touchState.steerAnalog = 0;
        this.$.steerThumb.style.left = '50%';
      }
    };
    pad.addEventListener('pointerup', endSlide);
    pad.addEventListener('pointercancel', endSlide);
  }

  _bindCanvasOrbit() {
    const canvas = this.$.canvas;
    canvas.addEventListener('pointerdown', (e) => {
      this.callbacks.onInteract?.();
      this.orbitPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (_) {}
    });

    canvas.addEventListener('pointermove', (e) => {
      const prev = this.orbitPointers.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      prev.x = e.clientX;
      prev.y = e.clientY;

      if (this.orbitPointers.size === 1) {
        this.orbitYawDelta -= dx * 0.0055;
        this.orbitPitchDelta = clamp(this.orbitPitchDelta + dy * 0.004, -0.5, 0.5);
      } else if (this.orbitPointers.size === 2) {
        const pts = Array.from(this.orbitPointers.values());
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (this.lastPinchDist !== null) {
          this.orbitZoomDelta -= (dist - this.lastPinchDist) * 0.025;
        }
        this.lastPinchDist = dist;
      }
    });

    const release = (e) => {
      this.orbitPointers.delete(e.pointerId);
      if (this.orbitPointers.size < 2) this.lastPinchDist = null;
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.orbitZoomDelta += e.deltaY * 0.004;
    }, { passive: false });
  }

  toggleLabDrawer(force) {
    const isHidden = this.$.labDrawer.classList.contains('hidden');
    const nextShow = force !== undefined ? force : isHidden;
    this.$.labDrawer.classList.toggle('hidden', !nextShow);
    this.$.btnLab.classList.toggle('active', nextShow);
  }

  consumeOrbitDeltas() {
    const out = {
      yaw: this.orbitYawDelta,
      pitch: this.orbitPitchDelta,
      zoom: this.orbitZoomDelta,
    };
    this.orbitYawDelta = 0;
    this.orbitPitchDelta = 0;
    this.orbitZoomDelta = 0;
    return out;
  }

  hasManualInput() {
    if (this.manualInputOverride) return true;
    const k = this.keys;
    if (
      k.has('KeyW') || k.has('ArrowUp') ||
      k.has('KeyS') || k.has('ArrowDown') ||
      k.has('KeyA') || k.has('ArrowLeft') ||
      k.has('KeyD') || k.has('ArrowRight') ||
      k.has('Space') || k.has('ShiftLeft') || k.has('ShiftRight')
    ) return true;
    const t = this.touchState;
    return t.left || t.right || t.pedal || t.brake || t.sprint || t.jumpHeld || Math.abs(t.steerAnalog) > 0.05;
  }

  getInput() {
    if (this.manualInputOverride) {
      const res = { ...this.manualInputOverride };
      this.manualInputOverride.jumpTriggered = false;
      return res;
    }

    const k = this.keys;
    const t = this.touchState;
    const throttle = (k.has('KeyW') || k.has('ArrowUp') || t.pedal) ? 1 : 0;
    const brake = (k.has('KeyS') || k.has('ArrowDown') || t.brake) ? 1 : 0;

    let steer = 0;
    if (k.has('KeyA') || k.has('ArrowLeft') || t.left) steer += 1;
    if (k.has('KeyD') || k.has('ArrowRight') || t.right) steer -= 1;
    if (Math.abs(t.steerAnalog) > 0.05) steer = t.steerAnalog;

    const sprint = k.has('ShiftLeft') || k.has('ShiftRight') || t.sprint;
    const jumpHeld = k.has('Space') || t.jumpHeld;
    const jumpTriggered = t.jumpQueued;
    t.jumpQueued = false;

    if ((throttle || Math.abs(steer) > 0.1 || jumpTriggered) && !this.hasMoved) {
      this.hasMoved = true;
      this.$.desktopHint.classList.add('faded');
    }

    return { throttle, brake, steer, sprint, jumpHeld, jumpTriggered };
  }

  showToast(tag, title, body, durationSec = 4.6) {
    this.$.toastTag.textContent = tag;
    this.$.toastTitle.textContent = title;
    this.$.toastBody.textContent = body;
    this.$.toast.classList.remove('hidden');
    this.toastTimer = durationSec;
  }

  updateHUD(state, camMode, autoCruise, muted, dt) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) {
        this.$.toast.classList.add('hidden');
      }
    }

    const now = performance.now();
    if (now - this.lastDomUpdate < 50) return;
    this.lastDomUpdate = now;

    const env = ENV_PRESETS[state.envId];
    const isEarth = state.envId === 'earth';

    this.$.envLabel.textContent = isEarth ? '地球 9.81 m/s²' : '月球 1.62 m/s²';
    this.$.btnEnvPill.classList.toggle('earth', isEarth);
    this.$.envMoon.classList.toggle('active', !isEarth);
    this.$.envEarth.classList.toggle('active', isEarth);

    this.$.beaconCount.textContent = `${state.beaconsCollected.length}/8`;

    const camNames = { chase: '视角:追随', side: '视角:侧拍', orbit: '视角:环月' };
    this.$.btnCam.textContent = camNames[camMode] || '视角';
    this.$.btnAuto.classList.toggle('active', autoCruise);
    this.$.btnAuto.textContent = autoCruise ? '巡航中' : '巡航';
    this.$.btnMute.textContent = muted ? '静音' : '声音';

    // Telemetry strip
    this.$.telSpeed.textContent = state.speedKmh.toFixed(1);
    this.$.telAlt.textContent = state.altitude.toFixed(2);
    this.$.telG.textContent = state.feltG.toFixed(2);
    const slipPct = Math.round(state.slipRatio * 100);
    this.$.telSlip.textContent = String(slipPct);
    this.$.telSlipBox.classList.toggle('slip-warn', slipPct >= 15);
    this.$.telLean.textContent = String(Math.round((state.roll * 180) / Math.PI));

    // Lab drawer readouts (only update when open)
    if (!this.$.labDrawer.classList.contains('hidden')) {
      this.$.labG.textContent = `${env.gravity.toFixed(2)} m/s²`;
      this.$.labRho.textContent = `${env.airDensity.toFixed(3)} kg/m³`;
      this.$.labN.textContent = `${state.normalForce.toFixed(1)} N`;
      this.$.labTrac.textContent = `${state.maxTraction.toFixed(1)} N`;
      this.$.labDrag.textContent = `${state.dragForce.toFixed(2)} N`;
      this.$.labSlope.textContent = `${state.groundSlopeDeg.toFixed(1)}°`;
      this.$.labBestH.textContent = `${state.bestJumpHeight.toFixed(2)} m`;
      this.$.labBestT.textContent = `${state.bestAirTime.toFixed(2)} s`;
    }
  }
}
