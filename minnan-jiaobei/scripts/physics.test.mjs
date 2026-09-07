import test from "node:test";
import assert from "node:assert/strict";
import { JiaobeiPhysics, classifyNormals } from "../physics.js";
function falling() {
  const sim = new JiaobeiPhysics(() => {}, { landingProtection: false });
  sim.launch(0, () => 0.5);
  sim.bodies.forEach((b, i) => {
    b.position.set(i ? 2 : -2, 2, 0);
    b.velocity.setZero();
    b.angularVelocity.setZero();
  });
  return sim;
}
test("free fall follows g=9.81 m/s² before contact", () => {
  const sim = falling();
  for (let i = 0; i < 24; i++) sim.step(1 / 120);
  for (const b of sim.bodies) {
    assert.ok(Math.abs(b.velocity.y + 9.81 * 0.2) < 1e-9);
    assert.ok(Math.abs(b.position.y - (2 - 0.5 * 9.81 * 0.2 ** 2)) < 0.009);
  }
});
test("30 and 60 Hz rendering produce the same fixed-step trajectory", () => {
  const a = falling(),
    b = falling();
  for (let i = 0; i < 6; i++) a.step(1 / 30);
  for (let i = 0; i < 12; i++) b.step(1 / 60);
  assert.ok(a.bodies[0].position.distanceTo(b.bodies[0].position) < 1e-9);
});
test("results follow physical normals, including edge-balanced cups", () => {
  assert.equal(classifyNormals([1, -1]).kind, "sheng");
  assert.equal(classifyNormals([-1, -1]).kind, "xiao");
  assert.equal(classifyNormals([1, 1]).kind, "yin");
  assert.equal(classifyNormals([0.1, 1]).kind, "undecided");
});
test("seeded throws collide, settle and report their measured orientation", () => {
  for (let seedBase = 15; seedBase < 21; seedBase++) {
    let seed = seedBase,
      impacts = 0;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const sim = new JiaobeiPhysics(() => impacts++);
    sim.launch(0.5, rnd);
    let result;
    for (let i = 0; i < 1500 && !result; i++) result = sim.step(1 / 120);
    assert.ok(impacts > 0);
    assert.ok(result);
    assert.ok(sim.bodies.every((b) => b.position.y > -0.1));
    if (result.kind !== "undecided")
      assert.equal(result.kind, classifyNormals(result.normals).kind);
  }
});

test("resting bodies cannot restart jitter after the result", () => {
  const sim = new JiaobeiPhysics();
  sim.launch(0.5, () => 0.37);
  let r;
  for (let i = 0; i < 1500 && !r; i++) r = sim.step(1 / 120);
  assert.ok(r);
  const poses = sim.bodies.map((b) => [
    ...b.position.toArray(),
    ...b.quaternion.toArray(),
  ]);
  for (let i = 0; i < 360; i++) sim.step(1 / 120);
  assert.deepEqual(
    sim.bodies.map((b) => [...b.position.toArray(), ...b.quaternion.toArray()]),
    poses,
  );
  assert.ok(
    sim.bodies.every(
      (b) => b.velocity.length() === 0 && b.angularVelocity.length() === 0,
    ),
  );
});

test("camera contains complete cups at extreme poses on mobile and desktop", async () => {
  const { TrayView } = await import("../view.js");
  const { PerspectiveCamera, Mesh, BoxGeometry } = await import("three");
  for (const [w, h] of [
    [320, 390],
    [390, 660],
    [844, 230],
    [1440, 700],
  ]) {
    const camera = new PerspectiveCamera(43, w / h, 0.1, 100),
      view = new TrayView();
    const cups = [
      new Mesh(new BoxGeometry(2.2, 1, 4.9)),
      new Mesh(new BoxGeometry(2.2, 1, 4.9)),
    ];
    for (let i = 0; i < 20; i++) {
      cups[0].position.set(-4 + i * 0.2, 1.5 + Math.sin(i), 0);
      cups[1].position.set(4 - i * 0.1, 0.5, 1);
      cups.forEach((c) => c.rotation.set(i * 0.3, i * 0.5, i * 0.1));
      view.fit(camera, cups);
      for (const p of view.corners()) {
        p.project(camera);
        assert.ok(Math.abs(p.x) <= 0.92 && Math.abs(p.y) <= 0.92);
      }
    }
  }
});

test("full Blender silhouettes remain separated and inside the tray throughout throws", async () => {
  const { landingBounds, SAFE_RADIUS, CENTRE_GAP } =
    await import("../landing-guard.js");
  const sim = new JiaobeiPhysics();
  for (let n = 1; n <= 100; n++) {
    let seed = n * 7919;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    sim.launch((n % 3) / 2, random);
    let result;
    for (let step = 0; step < 1500 && !result; step++) {
      result = sim.step(1 / 120);
      const [left, right] = sim.bodies.map(landingBounds);
      assert.ok(
        left.maxX <= -CENTRE_GAP + 1e-8,
        `left crossed centre, throw ${n}`,
      );
      assert.ok(
        right.minX >= CENTRE_GAP - 1e-8,
        `right crossed centre, throw ${n}`,
      );
      assert.ok(
        left.maxRadius <= SAFE_RADIUS + 1e-8 &&
          right.maxRadius <= SAFE_RADIUS + 1e-8,
        `outside tray, throw ${n}`,
      );
    }
    assert.ok(result, `throw ${n} did not finish`);
    assert.ok(
      result.elapsed < 6,
      `throw ${n} settled too slowly: ${result.elapsed}`,
    );
  }
});

test("landing guard recovers an overlapping outside pose without changing face direction", async () => {
  const { protectLanding, landingBounds, SAFE_RADIUS } =
    await import("../landing-guard.js");
  const sim = new JiaobeiPhysics();
  sim.launch(0.5, () => 0.8);
  sim.bodies.forEach((b, i) => {
    b.position.set(0.5, 0.1, 0.4);
    b.quaternion.setFromEuler(0.9, 1.4, 0.2);
    const normalBefore = 1 - 2 * (b.quaternion.x ** 2 + b.quaternion.z ** 2);
    protectLanding(b, i === 0 ? -1 : 1);
    assert.ok(landingBounds(b).maxRadius <= SAFE_RADIUS + 1e-8);
    const normalAfter = 1 - 2 * (b.quaternion.x ** 2 + b.quaternion.z ** 2);
    assert.ok(Math.abs(normalBefore - normalAfter) < 1e-8);
  });
});

test("staged cups hold still above the tray until release", () => {
  const sim = new JiaobeiPhysics();
  sim.stage(0.5, () => 0.5);
  assert.equal(sim.staged, true);
  assert.equal(sim.active, false);
  const held = sim.bodies.map((b) => b.position.clone());
  for (let i = 0; i < 120; i++) assert.equal(sim.step(1 / 120), null);
  sim.bodies.forEach((b, i) =>
    assert.ok(b.position.distanceTo(held[i]) < 1e-12),
  );
  assert.ok(sim.bodies.every((b) => b.position.y > 0.2));
  sim.release(0.5, () => 0.5);
  assert.equal(sim.active, true);
  assert.ok(sim.bodies.every((b) => b.velocity.y > 1.2));
});

test("a broken pose recovers to an undecided result instead of hanging", () => {
  const sim = new JiaobeiPhysics();
  sim.launch(0.5, () => 0.6);
  sim.bodies[0].position.set(NaN, NaN, NaN);
  const result = sim.step(1 / 120);
  assert.equal(result.kind, "undecided");
  assert.equal(sim.active, false);
  assert.ok(
    sim.bodies.every((b) =>
      [...b.position.toArray(), ...b.quaternion.toArray()].every(
        Number.isFinite,
      ),
    ),
  );
  assert.ok(sim.bodies.every((b) => b.sleepState === 2));
});
