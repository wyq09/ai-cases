/* Vehicles reserve separate bays; a single passenger queue serves only parked cars. */
(function (root) {
  class Traffic {
    constructor(engine, renderer, getState, hooks = {}) {
      this.engine = engine;
      this.renderer = renderer;
      this.getState = getState;
      this.hooks = hooks;
      this.generation = 0;
      this.moving = new Map();
      this.arriving = new Set();
      this.departing = new Map();
      this.boarding = null;
      this.waiters = new Set();
    }
    get busy() {
      return this.moving.size > 0 || this.departing.size > 0 || this.boarding !== null;
    }
    changed() {
      this.hooks.changed?.();
    }
    whenIdle() {
      if (!this.busy) return Promise.resolve(true);
      return new Promise((resolve) => this.waiters.add(resolve));
    }
    notifyIdle() {
      if (this.busy) return;
      this.renderer.updateStationStatus?.();
      this.hooks.settled?.();
      for (const resolve of this.waiters) resolve(true);
      this.waiters.clear();
    }
    reset() {
      this.generation++;
      this.moving.clear();
      this.arriving.clear();
      this.departing.clear();
      this.boarding = null;
      this.renderer.resetStation();
      for (const resolve of this.waiters) resolve(false);
      this.waiters.clear();
    }
    async dispatch(result) {
      const epoch = this.generation,
        id = result.before.id;
      if (this.moving.has(id)) return false;
      this.moving.set(id, result);
      if (result.type === "exit") this.arriving.add(id);
      this.changed();
      await this.renderer.animate(result);
      if (epoch !== this.generation) return false;
      this.moving.delete(id);
      this.arriving.delete(id);
      this.changed();
      this.pump();
      return this.whenIdle();
    }
    startDeparture(slot) {
      const state = this.getState(),
        vehicle = state.slots[slot];
      if (!vehicle || this.departing.has(vehicle.id)) return;
      const epoch = this.generation;
      this.departing.set(vehicle.id, slot);
      (async () => {
        await this.renderer.departVehicle(slot);
        if (epoch !== this.generation) return;
        if (this.getState().slots[slot]?.id === vehicle.id) this.engine.releaseFull(this.getState(), slot);
        this.departing.delete(vehicle.id);
        this.hooks.sound?.("exit");
        this.changed();
        this.pump();
      })();
    }
    pump() {
      const state = this.getState();
      state.slots.forEach((v, slot) => {
        if (v && v.loaded === v.capacity && !this.arriving.has(v.id)) this.startDeparture(slot);
      });
      if (this.boarding) return;
      const passenger = this.engine.nextPassenger(state, this.arriving);
      if (!passenger) {
        this.notifyIdle();
        return;
      }
      const epoch = this.generation,
        job = {};
      this.boarding = job;
      this.changed();
      (async () => {
        await this.renderer.boardPassenger(passenger);
        if (epoch !== this.generation) return;
        this.engine.loadPassenger(this.getState(), passenger);
        this.boarding = null;
        this.hooks.sound?.("tap");
        this.changed();
        this.pump();
      })();
    }
    service() {
      this.pump();
      return this.whenIdle();
    }
  }
  if (typeof module !== "undefined") module.exports = Traffic;
  root.ParkingTraffic = Traffic;
})(typeof window !== "undefined" ? window : globalThis);
