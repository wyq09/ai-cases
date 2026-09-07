import * as CANNON from "cannon-es";
import { protectLanding } from "./landing-guard.js";
import { Quaternion, Vector3 } from "three";
import { ConvexHull } from "three/addons/math/ConvexHull.js";

// Render units are 6 cm. Simulation uses metres, kilograms and seconds.
export const METRES = 0.06;
const MODEL_SCALE = 1.4;
const CENTRE = new CANNON.Vec3(0.18 * MODEL_SCALE, 0.28 * MODEL_SCALE, 0);
const STEP = 1 / 120;
// Cups are lifted and held like in two palms, then tossed DOWN onto the tray;
// power raises the hold a little and firms the wrist flick.
const HOLD_BASE = 0.3,
  HOLD_RISE = 0.1,
  HOLD_X = 0.09,
  REST_Y = (0.28 * MODEL_SCALE - 0.03) * METRES;
function hullShape(points) {
  const clean = [
    ...new Map(
      points.map((p) => {
        p.set(...[p.x, p.y, p.z].map((v) => Math.round(v * 1e7) / 1e7));
        return [p.toArray().join(), p];
      }),
    ).values(),
  ];
  const hull = new ConvexHull().setFromPoints(clean);
  const vertices = [],
    faces = [],
    ids = new Map();
  for (const face of hull.faces) {
    const indices = [];
    let edge = face.edge;
    do {
      const p = edge.head().point;
      if (!ids.has(p)) {
        ids.set(p, vertices.length);
        vertices.push(new CANNON.Vec3(p.x, p.y, p.z));
      }
      indices.push(ids.get(p));
      edge = edge.next;
    } while (edge !== face.edge);
    faces.push(indices);
  }
  const groups = new Map();
  for (const f of faces) {
    const a = vertices[f[0]],
      b = vertices[f[1]],
      c = vertices[f[2]];
    const n = b.vsub(a).cross(c.vsub(a));
    n.normalize();
    const key = [n.x, n.y, n.z, n.dot(a)].map((x) => x.toFixed(6)).join(",");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  const merged = [];
  for (const group of groups.values()) {
    const edges = new Map();
    for (const f of group)
      for (let i = 0; i < f.length; i++) {
        const a = f[i],
          b = f[(i + 1) % f.length],
          reverse = `${b},${a}`;
        if (edges.has(reverse)) edges.delete(reverse);
        else edges.set(`${a},${b}`, [a, b]);
      }
    const remaining = [...edges.values()],
      polygon = [remaining[0][0]];
    let next = remaining[0][1];
    for (let n = 0; n < remaining.length && next !== polygon[0]; n++) {
      polygon.push(next);
      const edge = remaining.find((e) => e[0] === next);
      if (!edge) break;
      next = edge[1];
    }
    let changed = true;
    while (changed && polygon.length > 3) {
      changed = false;
      for (let i = 0; i < polygon.length; i++) {
        const a = vertices[polygon[(i + polygon.length - 1) % polygon.length]],
          b = vertices[polygon[i]],
          c = vertices[polygon[(i + 1) % polygon.length]];
        if (b.vsub(a).cross(c.vsub(b)).length() < 1e-10) {
          polygon.splice(i, 1);
          changed = true;
          break;
        }
      }
    }
    merged.push(polygon);
  }
  return new CANNON.ConvexPolyhedron({ vertices, faces: merged });
}
function makeShapes() {
  // A single low-resolution convex proxy avoids overlapping contact seams.
  // The shallow inner bow is filled by the hull; outer profile matches Blender.
  const points = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8,
      width = 1.42 * Math.sin(Math.PI * t) ** 0.6 + 0.045,
      inner = 0.1 * Math.sin(Math.PI * t);
    for (let j = 0; j <= 6; j++) {
      const u = j / 6,
        x = (inner + width * u - 0.65) * MODEL_SCALE - CENTRE.x,
        z = -(t - 0.5) * 3.5 * MODEL_SCALE;
      const top =
        0.07 +
        0.62 * Math.sin(Math.PI * u) ** 0.6 * Math.sin(Math.PI * t) ** 0.6;
      for (const h of [0, top])
        points.push(
          new Vector3(
            x * METRES,
            (h * MODEL_SCALE - CENTRE.y) * METRES,
            z * METRES,
          ),
        );
    }
  }
  return [{ shape: hullShape(points), offset: new CANNON.Vec3() }];
}
export function classifyNormals(normals) {
  if (normals.some((y) => Math.abs(y) < 0.7))
    return { kind: "undecided", flat: null };
  const flat = normals.map((y) => y < 0);
  return {
    kind: flat[0] === flat[1] ? (flat[0] ? "xiao" : "yin") : "sheng",
    flat,
  };
}
export class JiaobeiPhysics {
  constructor(onImpact = () => {}, { landingProtection = true } = {}) {
    this.landingProtection = landingProtection;
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.81, 0),
      allowSleep: true,
    });
    this.world.solver.iterations = 18;
    this.world.solver.tolerance = 0.0001;
    const wood = new CANNON.Material("wood"),
      stone = new CANNON.Material("stone");
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(wood, stone, {
        friction: 0.42,
        restitution: 0.38,
        contactEquationStiffness: 1e5,
        contactEquationRelaxation: 4,
      }),
    );
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(wood, wood, {
        friction: 0.4,
        restitution: 0.24,
      }),
    );
    const floor = new CANNON.Body({
      mass: 0,
      material: stone,
      shape: new CANNON.Plane(),
    });
    floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    floor.position.y = -0.03 * METRES;
    this.world.addBody(floor);
    // Physical low rim matches the rendered circular tray. No camera chasing.
    for (let i = 0; i < 32; i++) {
      const angle = (i * Math.PI * 2) / 32;
      const wall = new CANNON.Body({
        mass: 0,
        material: stone,
        shape: new CANNON.Box(
          new CANNON.Vec3(0.43 * METRES, 0.3 * METRES, 0.08 * METRES),
        ),
      });
      wall.position.set(
        Math.sin(angle) * 4.35 * METRES,
        0.16 * METRES,
        Math.cos(angle) * 4.35 * METRES,
      );
      wall.quaternion.setFromEuler(0, angle, 0);
      this.world.addBody(wall);
    }
    const shapes = makeShapes();
    this.bodies = [0, 1].map(() => {
      const body = new CANNON.Body({
        mass: 0.09,
        material: wood,
        linearDamping: 0,
        angularDamping: 0.3,
        allowSleep: true,
        sleepSpeedLimit: 0.22,
        sleepTimeLimit: 0.35,
      });
      for (const { shape, offset } of shapes) body.addShape(shape, offset);
      // Cannon estimates diagonal inertia from the compound bounding box.
      body.addEventListener("collide", (e) => {
        const speed = Math.abs(e.contact.getImpactVelocityAlongNormal());
        if (speed > 0.15) onImpact(Math.min(speed / 3, 1));
      });
      this.world.addBody(body);
      return body;
    });
    this.active = false;
    this.staged = false;
    this.elapsed = 0;
    this.accumulator = 0;
  }
  launch(power, random) {
    this.stage(power, random);
    this.release(power, random);
  }
  // Freeze the cups at a held pose above the tray; stepping stays off until release.
  stage(power, random) {
    this.elapsed = 0;
    this.accumulator = 0;
    this.active = false;
    this.staged = true;
    this.stillTime = 0;
    this.lastCheck = 0;
    this.restPoses = null;
    this.bodies.forEach((b, i) => {
      b.wakeUp();
      b.quietFor = 0;
      b.linearDamping = 0;
      b.angularDamping = 0.15;
      b.force.setZero();
      b.torque.setZero();
      b.velocity.setZero();
      b.angularVelocity.setZero();
      b.position.set(
        (i ? 1 : -1) * HOLD_X,
        HOLD_BASE + power * HOLD_RISE + (random() - 0.5) * 0.006,
        (i ? 0.12 : -0.12) * METRES,
      );
      // Held like in cupped palms: tipped slightly toward each other, flat face up.
      b.quaternion.setFromEuler(
        (random() - 0.5) * 0.2,
        (random() - 0.5) * 0.12,
        (i ? 1 : -1) * (0.12 + random() * 0.08),
      );
      if (this.landingProtection) protectLanding(b, i === 0 ? -1 : 1);
      b.previousPosition.copy(b.position);
      b.interpolatedPosition.copy(b.position);
      b.previousQuaternion.copy(b.quaternion);
      b.interpolatedQuaternion.copy(b.quaternion);
    });
  }
  release(power, random) {
    if (!this.staged) return;
    this.staged = false;
    this.active = true;
    this.bodies.forEach((b, i) => {
      // A real toss: wrists flick downward, cups spread apart mid-air and
      // tumble on the tray until they come to rest on a face.
      b.velocity.set(
        (i ? 1 : -1) * (0.14 + power * 0.2 + random() * 0.05),
        -(0.55 + power * 0.5),
        (random() - 0.5) * 0.08,
      );
      b.angularVelocity.set(
        (random() - 0.5) * 2 * (12 - 3 * power),
        (random() - 0.5) * 1.4,
        (random() - 0.5) * 2 * (6 + 2 * power),
      );
    });
  }
  poseOf(i) {
    const b = this.bodies[i],
      offset = b.quaternion.vmult(CENTRE);
    return {
      position: new Vector3(
        b.position.x / METRES - offset.x,
        b.position.y / METRES - offset.y,
        b.position.z / METRES - offset.z,
      ),
      quaternion: new Quaternion(
        b.quaternion.x,
        b.quaternion.y,
        b.quaternion.z,
        b.quaternion.w,
      ),
    };
  }
  // Last resort after a broken pose (NaN or a thrown contact): park both cups
  // flat in the tray and report undecided instead of freezing the page.
  recover() {
    this.active = false;
    this.staged = false;
    this.bodies.forEach((b, i) => {
      b.position.set((i ? 1.2 : -1.2) * METRES, REST_Y, 0);
      b.quaternion.setFromEuler(Math.PI, 0, 0);
      b.velocity.setZero();
      b.angularVelocity.setZero();
      b.sleep();
    });
    return {
      kind: "undecided",
      flat: null,
      normals: this.bodies.map((b) => b.quaternion.vmult(new CANNON.Vec3(0, 1, 0)).y),
      elapsed: this.elapsed,
    };
  }
  step(dt) {
    if (!this.active) return null;
    this.accumulator += Math.min(dt, 0.1);
    try {
      while (this.accumulator >= STEP) {
        this.world.step(STEP);
        if (this.landingProtection)
          this.bodies.forEach((b, i) => protectLanding(b, i === 0 ? -1 : 1));
        for (const body of this.bodies) {
          const grounded = this.world.contacts.some(
            (c) =>
              (c.bi === body || c.bj === body) &&
              (c.bi.mass === 0 || c.bj.mass === 0),
          );
          body.linearDamping = grounded ? 0.3 : 0;
          body.angularDamping = grounded ? 0.45 : 0.1;
          if (
            grounded &&
            body.velocity.length() < 0.018 &&
            body.angularVelocity.length() < 0.2
          ) {
            body.quietFor = (body.quietFor || 0) + STEP;
            if (body.quietFor > 0.22) body.sleep();
          } else body.quietFor = 0;
        }
        this.elapsed += STEP;
        this.accumulator -= STEP;
      }
    } catch {
      return this.recover();
    }
    for (const b of this.bodies)
      if (
        ![...b.position.toArray(), ...b.quaternion.toArray()].every(
          Number.isFinite,
        )
      )
        return this.recover();
    if (this.elapsed - this.lastCheck >= 0.2) {
      const quiet =
        this.restPoses &&
        this.bodies.every((b, i) => {
          const p = this.restPoses[i];
          const dot = Math.abs(
            b.quaternion.x * p.q.x +
              b.quaternion.y * p.q.y +
              b.quaternion.z * p.q.z +
              b.quaternion.w * p.q.w,
          );
          return (
            b.position.distanceTo(p.p) < 0.0015 &&
            dot > Math.cos(0.025 / 2) &&
            b.position.y < 0.07
          );
        });
      this.stillTime = quiet
        ? this.stillTime + (this.elapsed - this.lastCheck)
        : 0;
      this.lastCheck = this.elapsed;
      this.restPoses = this.bodies.map((b) => ({
        p: b.position.clone(),
        q: b.quaternion.clone(),
      }));
    }
    const settled =
      this.bodies.every((b) => b.sleepState === CANNON.Body.SLEEPING) ||
      this.stillTime > 0.6;
    if (settled || this.elapsed > 12) {
      this.active = false;
      this.bodies.forEach((b) => b.sleep());
      const normal = new CANNON.Vec3(0, 1, 0);
      const normals = this.bodies.map((b) => b.quaternion.vmult(normal).y);
      // Never force a face or turn a still-moving / edge-balanced cup into an answer.
      return {
        ...(settled
          ? classifyNormals(normals)
          : { kind: "undecided", flat: null }),
        normals,
        elapsed: this.elapsed,
      };
    }
    return null;
  }
  sync(cups) {
    this.bodies.forEach((b, i) => {
      cups[i].quaternion.copy(b.quaternion);
      const offset = b.quaternion.vmult(CENTRE);
      cups[i].position.set(
        b.position.x / METRES - offset.x,
        b.position.y / METRES - offset.y,
        b.position.z / METRES - offset.z,
      );
    });
  }
}
