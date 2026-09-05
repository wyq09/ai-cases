import * as T from "./vendor/three.module-gpt-6-Astra.min.js";
import { person, release } from "./models-gpt-6-Astra.js";
import { ParkingRenderer } from "./scene-gpt-6-Astra.js";
const P = ParkingRenderer.prototype;
const smooth = (t) => t * t * (3 - 2 * t);
function line(points, t) {
  const lengths = points.slice(1).map((p, i) => p.distanceTo(points[i])),
    total = lengths.reduce((a, b) => a + b, 0);
  let d = t * total;
  for (let i = 0; i < lengths.length; i++)
    if (d <= lengths[i] || i === lengths.length - 1) {
      const dir = points[i + 1].clone().sub(points[i]);
      return {
        position: points[i]
          .clone()
          .lerp(points[i + 1], lengths[i] ? Math.min(d / lengths[i], 1) : 1),
        angle: Math.atan2(-dir.z, dir.x),
      };
    } else d -= lengths[i];
  return { position: points[0].clone(), angle: 0 };
}
P.runPhase = function (key, duration, update, cleanup = () => {}) {
  return new Promise((resolve) => {
    this.phases.set(key, {
      start: performance.now(),
      duration:
        Math.max(30, duration / (this.speed || 1)) * (this.reduce ? 0.25 : 1),
      update,
      cleanup,
      resolve,
    });
    update(0);
    this.updateStationStatus();
  });
};
P.tickActions = function (time) {
  for (const [key, p] of this.phases) {
    const t = Math.min(1, (time - p.start) / p.duration);
    p.update(t);
    if (t >= 1) {
      this.phases.delete(key);
      p.cleanup();
      p.resolve(true);
      this.updateStationStatus();
    }
  }
};
P.animate = async function (result) {
  if (!result?.before) return;
  const v = result.before,
    id = v.id,
    m = this.ensureCar(v),
    start = this.position(v),
    epoch = this.epoch;
  this.actions.set(id, result);
  m.position.copy(start);
  m.rotation.y = this.angle(v.dir);
  if (result.type === "blocked") {
    const end = this.position(result.after);
    await this.runPhase(`vehicle-${id}`, 330, (t) => {
      m.position.copy(start).lerp(end, smooth(t));
      if (!result.steps)
        m.position.add(
          new T.Vector3(
            Math.cos(this.angle(v.dir)),
            0,
            -Math.sin(this.angle(v.dir)),
          ).multiplyScalar(Math.sin(t * Math.PI * 2) * 0.08),
        );
    });
  } else {
    const l = this.layout(),
      bay = this.bayPoint(result.slot),
      points = [start];
    if (v.dir === 0)
      points.push(
        new T.Vector3(l.edge, 0, start.z),
        new T.Vector3(l.edge, 0, l.north),
      );
    if (v.dir === 1)
      points.push(
        new T.Vector3(start.x, 0, 2 + l.edge),
        new T.Vector3(l.edge, 0, 2 + l.edge),
        new T.Vector3(l.edge, 0, l.north),
      );
    if (v.dir === 2)
      points.push(
        new T.Vector3(-l.edge, 0, start.z),
        new T.Vector3(-l.edge, 0, l.north),
      );
    if (v.dir === 3) points.push(new T.Vector3(start.x, 0, l.north));
    points.push(new T.Vector3(bay.x, 0, l.north), bay);
    const distance = points
      .slice(1)
      .reduce((sum, p, i) => sum + p.distanceTo(points[i]), 0);
    await this.runPhase(`vehicle-${id}`, 550 + distance * 70, (t) => {
      const p = line(points, smooth(t));
      m.position.copy(p.position);
      const delta = Math.atan2(
        Math.sin(p.angle - m.rotation.y),
        Math.cos(p.angle - m.rotation.y),
      );
      m.rotation.y += delta * 0.46;
      if (t > 0.95) m.rotation.y = Math.PI / 2;
    });
    if (epoch !== this.epoch) return;
    await this.runPhase(`vehicle-${id}`, 160, (t) => {
      m.position.copy(bay);
      m.position.y = Math.sin(t * Math.PI) * 0.04;
      m.rotation.y = Math.PI / 2;
    });
  }
  if (epoch === this.epoch) {
    this.actions.delete(id);
    this.syncCars();
  }
};
P.boardPassenger = async function (passenger) {
  const v = this.state().slots[passenger.slot];
  if (!v || v.id !== passenger.id) return;
  const m = this.ensureCar(v),
    p = person(passenger.color),
    bay = this.bayPoint(passenger.slot),
    start = this.queuePoint(),
    epoch = this.epoch;
  const outside = new T.Vector3(bay.x - 0.76, 0, bay.z - 0.1),
    inside = new T.Vector3(bay.x - 0.2, 0, bay.z - 0.1);
  const points = [start, new T.Vector3(outside.x, 0, start.z), outside, inside];
  this.scene.add(p);
  this.batcher.dirty = true;
  m.userData.door.visible = true;
  await this.runPhase(
    "boarding",
    620 + Math.abs(start.x - outside.x) * 35,
    (t) => {
      const a = line(points, smooth(Math.min(1, t / 0.92)));
      p.position.copy(a.position);
      p.position.y =
        0.19 * (1 - Math.max(0, t - 0.75) * 4) +
        Math.abs(Math.sin(t * 25)) * 0.035;
      p.rotation.y = a.angle - Math.PI / 2;
      p.userData.legs.forEach(
        (leg, i) => (leg.rotation.x = Math.sin(t * 30 + i * Math.PI) * 0.45),
      );
      const scale = t > 0.83 ? Math.max(0.04, (1 - t) / 0.17) : 1;
      p.scale.setScalar(scale);
      m.userData.door.rotation.y =
        -Math.sin((Math.min(1, t / 0.2) * Math.PI) / 2) *
        1.0 *
        (t > 0.85 ? (1 - t) / 0.15 : 1);
    },
    () => {
      release(p);
      this.batcher.dirty = true;
      m.userData.door.visible = false;
    },
  );
  if (epoch === this.epoch) {
    this.syncQueue(true);
    this.updateStationStatus();
  }
};
P.departVehicle = async function (slot) {
  const v = this.state().slots[slot];
  if (!v) return;
  const id = v.id,
    m = this.ensureCar(v),
    bay = this.bayPoint(slot),
    l = this.layout(),
    epoch = this.epoch;
  this.actions.set(id, { type: "departure" });
  m.userData.badge.visible = false;
  // Depart via the bay's outer edge into a separate road, never through the parking grid.
  const points = [
    bay,
    new T.Vector3(bay.x, 0, l.north),
    new T.Vector3(l.left - 2.4, 0, l.north),
  ];
  await this.runPhase(`vehicle-${id}`, 1000, (t) => {
    const p = line(points, smooth(t));
    m.position.copy(p.position);
    const reverse = p.position.z < l.north - 0.02;
    const angle = reverse ? Math.PI / 2 : p.angle;
    const d = Math.atan2(
      Math.sin(angle - m.rotation.y),
      Math.cos(angle - m.rotation.y),
    );
    m.rotation.y += d * 0.4;
    if (t > 0.82) m.scale.setScalar(1.25 * Math.max(0.02, (1 - t) / 0.18));
  });
  if (epoch === this.epoch) {
    this.actions.delete(id);
    release(m);
    this.cars.delete(id);
    this.batcher.dirty = true;
  }
};
P.resetStation = function () {
  this.epoch++;
  for (const p of this.phases.values()) {
    p.cleanup();
    p.resolve(false);
  }
  this.phases.clear();
  this.actions.clear();
  for (const m of this.cars.values()) release(m);
  this.cars.clear();
  this.layoutKey = null;
  this.queueKey = null;
  this.rebuild();
  this.updateStationStatus();
};
