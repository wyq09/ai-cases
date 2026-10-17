const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.steer = 0;
    this.brake = false;
    this.drift = false;
    this.nitroQueued = false;
    this.driftPresses = 0;
    this.startPresses = 0;
    this.pauseQueued = false;
    this.muteQueued = false;
    this.enabled = true;

    this.touch = { left: false, right: false, drift: false, nitro: false, brake: false };
    this.manual = null;
    this._manualPrevDrift = false;
    this._touchPointers = new Map();

    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.reset());

    document.querySelectorAll('[data-drive]').forEach((btn) => {
      const action = btn.dataset.drive;
      let pointerHeld = false;
      const set = (on) => {
        if (action === 'left' || action === 'right') this.touch[action] = on;
        if (action === 'drift') {
          this.touch.drift = on;
          if (on) {
            this.driftPresses++;
            this.startPresses++;
          }
        }
        if (action === 'nitro') {
          this.touch.nitro = on;
          if (on) {
            this.nitroQueued = true;
            this.startPresses++;
          }
        }
        if (action === 'brake') this.touch.brake = on;
        btn.classList.toggle('active', on);
      };
      const down = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
          if (e.pointerId != null) this._touchPointers.set(e.pointerId, set);
        }
        pointerHeld = true;
        set(true);
      };
      const up = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        if (!pointerHeld && !btn.classList.contains('active')) return;
        pointerHeld = false;
        set(false);
      };
      btn.addEventListener('pointerdown', (e) => {
        down(e);
        try { btn.setPointerCapture(e.pointerId); } catch (err) {}
      });
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('lostpointercapture', up);
      btn.addEventListener('touchstart', (e) => { down(e); }, { passive: false });
      btn.addEventListener('touchend', up);
      btn.addEventListener('touchcancel', up);
      btn.addEventListener('mousedown', down);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });

    const releasePointer = (id) => {
      const fn = this._touchPointers.get(id);
      if (fn) {
        fn(false);
        this._touchPointers.delete(id);
      }
    };
    window.addEventListener('pointerup', (e) => releasePointer(e.pointerId));
    window.addEventListener('pointercancel', (e) => releasePointer(e.pointerId));
    window.addEventListener('touchend', (e) => {
      if (!e.touches || e.touches.length === 0) {
        for (const fn of this._touchPointers.values()) fn(false);
        this._touchPointers.clear();
        this.touch.left = this.touch.right = this.touch.drift = this.touch.nitro = this.touch.brake = false;
        document.querySelectorAll('[data-drive]').forEach((b) => b.classList.remove('active'));
      }
    }, { passive: true });
    window.addEventListener('touchcancel', () => {
      for (const fn of this._touchPointers.values()) fn(false);
      this._touchPointers.clear();
    });

    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => {
        this.pauseQueued = true;
      });
    }
    const muteBtn = document.getElementById('mute-btn-hud');
    if (muteBtn) {
      muteBtn.addEventListener('click', () => {
        this.muteQueued = true;
      });
    }
  }

  onKey(e, down) {
    const code = e.code;
    const driveKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'ShiftLeft', 'ShiftRight', 'Space'];
    if (driveKeys.includes(code)) e.preventDefault();
    if (code === 'Escape' || code === 'KeyP') {
      if (down && !this.keys.has(code)) this.pauseQueued = true;
      if (down) this.keys.add(code);
      else this.keys.delete(code);
      return;
    }
    if (code === 'KeyM') {
      if (down && !this.keys.has(code)) this.muteQueued = true;
      if (down) this.keys.add(code);
      else this.keys.delete(code);
      return;
    }
    if (down) {
      if (!this.keys.has(code)) {
        if (code === 'ShiftLeft' || code === 'ShiftRight') this.driftPresses++;
        if (code === 'Space') this.nitroQueued = true;
        if (code === 'KeyW' || code === 'ArrowUp') this.pressed.add('accel');
        if (['ShiftLeft', 'ShiftRight', 'Space', 'KeyW', 'ArrowUp'].includes(code)) this.startPresses++;
      }
      this.keys.add(code);
    } else {
      this.keys.delete(code);
    }
  }

  consumeStartPress() {
    if (this.startPresses > 0) {
      this.startPresses = 0;
      return true;
    }
    return false;
  }

  consumeNitro() {
    const v = this.nitroQueued;
    this.nitroQueued = false;
    return v;
  }

  consumeDriftPress() {
    if (this.driftPresses > 0) {
      this.driftPresses = 0;
      return true;
    }
    return false;
  }

  consumePause() {
    const v = this.pauseQueued;
    this.pauseQueued = false;
    return v;
  }

  consumeMute() {
    const v = this.muteQueued;
    this.muteQueued = false;
    return v;
  }

  update(dt) {
    if (!this.enabled) {
      this.steer += (0 - this.steer) * Math.min(1, dt * 10);
      return;
    }
    if (this.manual) {
      this.steer += (clamp(this.manual.steer || 0, -1, 1) - this.steer) * Math.min(1, dt * 12);
      this.brake = !!this.manual.brake;
      const nextDrift = !!this.manual.drift;
      if (nextDrift && !this._manualPrevDrift) {
        this.driftPresses++;
        this.startPresses++;
      }
      this._manualPrevDrift = nextDrift;
      this.drift = nextDrift;
      if (this.manual.nitro) {
        this.nitroQueued = true;
        this.manual.nitro = false;
      }
      if (this.manual.start) {
        this.startPresses++;
        this.manual.start = false;
      }
      return;
    }
    const k = this.keys;
    const left = k.has('ArrowLeft') || k.has('KeyA') || this.touch.left;
    const right = k.has('ArrowRight') || k.has('KeyD') || this.touch.right;
    // positive steer turns the car toward its left (heading increases);
    // left input must win here so screen-left button/arrow turns left.
    const target = (left ? 1 : 0) - (right ? 1 : 0);
    const rate = target === 0 ? 12 : 9;
    this.steer += (target - this.steer) * Math.min(1, dt * rate);
    this.brake = k.has('ArrowDown') || k.has('KeyS') || this.touch.brake;
    this.drift = k.has('ShiftLeft') || k.has('ShiftRight') || this.touch.drift;
  }

  reset() {
    this.keys.clear();
    this.touch.left = this.touch.right = this.touch.drift = this.touch.nitro = this.touch.brake = false;
    this.steer = 0;
    this.drift = false;
    this.brake = false;
    this.nitroQueued = false;
    this.driftPresses = 0;
    this.startPresses = 0;
    document.querySelectorAll('[data-drive]').forEach((b) => b.classList.remove('active'));
  }
}
