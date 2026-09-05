const assert = require("node:assert/strict");
const E = require("./engine-gpt-6-Astra.js");
const checkConservation = (s) => {
  const all = [...s.vehicles, ...s.slots.filter(Boolean)];
  assert.equal(
    s.queue.length,
    all.reduce((sum, v) => sum + v.capacity - v.loaded, 0),
  );
  assert.equal(s.total, s.delivered + s.queue.length);
  for (let color = 0; color < 6; color++)
    assert.equal(
      s.queue.filter((c) => c === color).length,
      all.filter((v) => v.color === color).reduce((sum, v) => sum + v.capacity - v.loaded, 0),
    );
};
function validate(n) {
  const s = E.create(n);
  assert(E.solve(s).solvable, `unsolvable level ${n}`);
  const occupied = new Set();
  for (const v of s.vehicles)
    for (const [x, y] of E.cells(v)) {
      assert(x >= 0 && y >= 0 && x < s.cols && y < s.rows);
      assert(!occupied.has(`${x},${y}`));
      occupied.add(`${x},${y}`);
    }
  checkConservation(s);
  for (const id of s.order) {
    const result = E.move(s, id);
    assert.equal(result.type, "exit");
    checkConservation(s);
    assert(s.slots.some((v) => !v));
  }
  assert(s.won);
  assert.equal(s.delivered, s.total);
}
const begin = Date.now();
for (let n = 1; n <= 1000; n++) {
  validate(n);
  if (n % 100 === 0) console.log(`${n}/1000 levels verified`);
}
for (const n of [9999, 99999, 1000000, 4294967296, 9007199254740000]) validate(n);
assert.deepEqual(E.create(235), E.create(235), "same seed produces same level");
assert.notDeepEqual(E.create(1).seed, E.create(4294967297).seed, "large seeds incorporate high bits");
const blocked = {
  cols: 7,
  rows: 7,
  vehicles: [
    { id: 0, x: 0, y: 1, len: 2, dir: 0, color: 0, capacity: 4, loaded: 0 },
    { id: 1, x: 4, y: 0, len: 2, dir: 1, color: 1, capacity: 4, loaded: 0 },
  ],
  slots: Array(4).fill(null),
  queue: Array(4).fill(1).concat(Array(4).fill(0)),
  moves: 0,
  delivered: 0,
  cleared: 0,
  total: 8,
};
const collision = E.move(blocked, 0);
assert.equal(collision.type, "blocked");
assert.equal(collision.steps, 2);
assert.equal(blocked.vehicles[0].x, 2);
const dead = E.clone(blocked);
dead.vehicles = [
  { id: 0, x: 0, y: 0, len: 2, dir: 0, color: 0, capacity: 4, loaded: 0 },
  { id: 1, x: 2, y: 0, len: 2, dir: 2, color: 1, capacity: 4, loaded: 0 },
];
assert(E.stuck(dead));
assert(!E.solve(dead).solvable);
const full = E.create(8);
full.slots = Array.from({ length: 4 }, (_, i) => ({ id: 100 + i, color: 1, len: 2, capacity: 4, loaded: 0 }));
full.queue = [...Array(4).fill(0), ...Array(16).fill(1)];
full.vehicles = [{ id: 0, x: 0, y: 0, len: 2, dir: 0, color: 0, capacity: 4, loaded: 0 }];
full.total = 20;
assert(E.stuck(full));
assert.equal(E.move(full, 0).type, "full");
const sort = E.sortQueue(full);
assert(sort.departed.length >= 1);
assert(full.slots.some((v) => !v));
checkConservation(full);
for (let n = 1; n <= 60; n++) {
  const s = E.create(n);
  const first = s.order[0];
  E.move(s, first);
  checkConservation(s);
  const remove = s.vehicles.at(-1);
  E.remove(s, remove.id);
  checkConservation(s);
  const flip = s.vehicles[0];
  flip.dir = (flip.dir + 2) % 4;
  E.shuffle(s);
  checkConservation(s);
  assert(E.solve(s).solvable);
  let loops = 0;
  while (!s.won && loops++ < 100) {
    const v = E.hint(s);
    if (v) E.move(s, v.id);
    else assert(E.sortQueue(s));
    checkConservation(s);
  }
  assert(s.won, `reshuffle level ${n} not completed`);
}
// A partially loaded waiting car must survive reshuffle and removal without duplicating passengers.
const partial = E.create(2),
  v = partial.vehicles.shift();
partial.slots[0] = v;
v.loaded = 2;
let removed = 0;
partial.queue = partial.queue.filter((c) => (c === v.color && removed++ < 2 ? false : true));
partial.delivered = 2;
checkConservation(partial);
E.shuffle(partial);
checkConservation(partial);
console.log(
  `PASS: 1005 solvable levels, deterministic seeds, collision, deadlock, full-slot rescue, 60 reshuffles, passenger conservation (${((Date.now() - begin) / 1000).toFixed(1)}s)`,
);
