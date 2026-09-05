const assert = require("node:assert/strict");
const E = require("./engine-gpt-6-Astra.js");
function conservation(s) {
  assert.equal(s.queue.length + s.delivered, s.total);
  for (let color = 0; color < 6; color++) {
    const remaining = [...s.vehicles, ...s.slots.filter(Boolean)]
      .filter((v) => v.color === color)
      .reduce((sum, v) => sum + v.capacity - v.loaded, 0);
    assert.equal(s.queue.filter((c) => c === color).length, remaining);
  }
}
function service(s, restore = false) {
  let steps = 0;
  while (++steps < 300) {
    const full = s.slots.findIndex((v) => v && v.loaded === v.capacity);
    if (full >= 0) {
      E.releaseFull(s, full);
    } else {
      const passenger = E.nextPassenger(s);
      if (!passenger) break;
      const old = s.slots[passenger.slot].loaded,
        delivered = s.delivered;
      assert.equal(E.releaseFull(s, passenger.slot), null, "departed before full");
      E.loadPassenger(s);
      assert.equal(s.slots[passenger.slot].loaded, old + 1);
      assert.equal(s.delivered, delivered + 1);
    }
    conservation(s);
    if (restore) s = E.clone(s); // Any boarding/departure boundary can be serialized and resumed.
  }
  assert(steps < 300);
  return s;
}
for (let n = 1; n <= 100; n++) {
  let s = E.create(n);
  for (const id of s.order) {
    const oldQueue = s.queue.length,
      oldDelivered = s.delivered;
    const result = E.move(s, id, { deferBoarding: true });
    assert.equal(result.type, "exit");
    assert.equal(s.queue.length, oldQueue, "passenger disappeared during arrival");
    assert.equal(s.delivered, oldDelivered);
    assert.equal(s.slots[result.slot].loaded, 0, "car boarded before parking");
    s = service(s, true);
  }
  assert(s.won);
  assert.equal(s.delivered, s.total);
}
let waiting = E.create(5);
const red = { id: 500, dir: 0, len: 2, color: 0, capacity: 4, loaded: 0 };
const blue = { id: 501, dir: 0, len: 2, color: 1, capacity: 4, loaded: 0 };
waiting.vehicles = [];
waiting.slots = [red, blue, null, null];
waiting.queue = [1, 1, 1, 1, 0, 0, 0, 0];
waiting.delivered = 0;
waiting.total = 8;
const sorted = E.sortQueue(waiting, { deferBoarding: true });
assert.equal(sorted.departed.length, 0);
assert.equal(waiting.queue.length, 8);
waiting = service(waiting, true);
assert(waiting.won);
let reshuffle = E.create(10);
E.move(reshuffle, reshuffle.order[0], { deferBoarding: true });
E.loadPassenger(reshuffle);
const delivered = reshuffle.delivered,
  queue = reshuffle.queue.length;
E.shuffle(reshuffle, { deferBoarding: true });
assert.equal(reshuffle.delivered, delivered);
assert.equal(reshuffle.queue.length, queue);
reshuffle = service(reshuffle, true);
conservation(reshuffle);
console.log(
  "PASS: 100 phased levels; no boarding before parking; incremental seats; no early departure; save/resume at every boundary; sorting and refresh preserve counts.",
);
