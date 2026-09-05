const assert = require("node:assert/strict");
const E = require("./engine-gpt-6-Astra.js");
const Traffic = require("./traffic-gpt-6-Astra.js");
const tick = () => new Promise((resolve) => setImmediate(resolve));
class FakeRenderer {
  constructor() {
    this.arrivals = new Map();
    this.loads = [];
    this.departures = new Map();
  }
  animate(result) {
    return new Promise((resolve) => this.arrivals.set(result.before.id, resolve));
  }
  boardPassenger(passenger) {
    return new Promise((resolve) => this.loads.push({ passenger, resolve }));
  }
  departVehicle(slot) {
    return new Promise((resolve) => this.departures.set(slot, resolve));
  }
  resetStation() {}
}
function fixture() {
  const s = E.create(1);
  s.vehicles = Array.from({ length: 5 }, (_, id) => ({
    id,
    x: 0,
    y: id,
    dir: 0,
    len: 2,
    color: id < 2 ? 0 : id - 1,
    loaded: 0,
    capacity: 4,
  }));
  s.queue = s.vehicles.flatMap((v) => Array(4).fill(v.color));
  s.total = 20;
  s.delivered = 0;
  s.cleared = 0;
  return s;
}
function conserve(s) {
  assert.equal(s.delivered + s.queue.length, s.total);
  assert.equal(
    s.queue.length,
    [...s.vehicles, ...s.slots.filter(Boolean)].reduce((sum, v) => sum + v.capacity - v.loaded, 0),
  );
}
async function drain(renderer, traffic) {
  let rounds = 0;
  while (traffic.busy && rounds++ < 100) {
    for (const [id, resolve] of renderer.arrivals) {
      renderer.arrivals.delete(id);
      resolve();
    }
    for (const job of renderer.loads.splice(0)) job.resolve();
    for (const [slot, resolve] of renderer.departures) {
      renderer.departures.delete(slot);
      resolve();
    }
    await tick();
  }
  assert(rounds < 100, "traffic did not drain");
}
(async () => {
  let s = fixture();
  const renderer = new FakeRenderer();
  const traffic = new Traffic(E, renderer, () => s, {
    changed() {
      conserve(s);
    },
  });
  const promises = [];
  const dispatch = (id) => {
    const r = E.move(s, id, { deferBoarding: true });
    assert.equal(r.type, "exit");
    promises.push(traffic.dispatch(r));
  };
  dispatch(0);
  dispatch(1);
  assert.equal(traffic.moving.size, 2, "second car was blocked by the first");
  assert.deepEqual(
    s.slots.slice(0, 2).map((v) => v.id),
    [0, 1],
    "duplicate bay reservation",
  );
  renderer.arrivals.get(1)();
  renderer.arrivals.delete(1);
  await tick();
  assert.equal(renderer.loads[0].passenger.id, 1, "passenger chose an unparked same-color car");
  renderer.loads.shift().resolve();
  await tick();
  assert.equal(s.slots[0].loaded, 0);
  assert.equal(s.slots[1].loaded, 1, "seat committed to wrong car");
  dispatch(2);
  dispatch(3);
  assert.equal(traffic.moving.size, 3, "boarding blocked new departures");
  assert.equal(E.move(s, 4, { deferBoarding: true }).type, "full", "fifth car exceeded four reserved bays");
  assert.equal(s.vehicles.length, 1);
  for (let i = 0; i < 3; i++) {
    renderer.loads.shift().resolve();
    await tick();
  }
  assert(traffic.departing.has(1), "full car did not leave independently");
  assert(traffic.moving.has(0), "arrival unexpectedly synchronized to boarding");
  renderer.arrivals.get(0)();
  renderer.arrivals.delete(0);
  await tick();
  assert(traffic.boarding && traffic.departing.size, "boarding waited for another car to depart");
  await drain(renderer, traffic);
  await Promise.all(promises);
  assert.equal(s.delivered, 16);
  assert(s.slots.every((v) => !v));
  dispatch(4);
  await drain(renderer, traffic);
  assert(s.won);
  assert.equal(s.delivered, 20);
  // Reset invalidates both an old car arrival and an old passenger completion.
  s = fixture();
  traffic.reset();
  dispatch(0);
  const oldArrival = renderer.arrivals.get(0);
  s = E.create(9);
  traffic.reset();
  const fresh = JSON.stringify(s);
  oldArrival();
  await tick();
  assert.equal(JSON.stringify(s), fresh, "stale arrival changed a new level");
  s = fixture();
  traffic.reset();
  dispatch(0);
  renderer.arrivals.get(0)();
  renderer.arrivals.delete(0);
  await tick();
  const oldPassenger = renderer.loads.shift();
  assert(oldPassenger);
  s = E.create(10);
  traffic.reset();
  const next = JSON.stringify(s);
  oldPassenger.resolve();
  await tick();
  assert.equal(JSON.stringify(s), next, "stale boarding changed a new level");
  assert(!traffic.busy);
  console.log(
    "PASS: simultaneous dispatch, boarding during arrivals and departures, reserved bay limit, correct same-color target, passenger conservation, full victory and stale callback cancellation.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
