(function (root) {
  "use strict";
  const COLORS = [
    { name: "珊瑚红", body: "#ee786b", top: "#ff9e8d", dark: "#bd4e48", mark: "●" },
    { name: "天空蓝", body: "#54a9d1", top: "#8ad3ec", dark: "#327795", mark: "◆" },
    { name: "柠檬黄", body: "#edbd4d", top: "#ffe491", dark: "#b28b31", mark: "★" },
    { name: "薄荷绿", body: "#71b38b", top: "#a2d9ab", dark: "#45815f", mark: "▲" },
    { name: "葡萄紫", body: "#a38cca", top: "#cbb6e9", dark: "#766195", mark: "✚" },
    { name: "蜜桃橙", body: "#e39757", top: "#ffc88a", dark: "#b3713c", mark: "■" },
  ];
  const DIRS = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function rng(seed) {
    return () => {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function cells(v) {
    return Array.from({ length: v.len }, (_, i) => [v.x + (v.dir % 2 === 0 ? i : 0), v.y + (v.dir % 2 ? i : 0)]);
  }
  function path(v, vehicles, cols, rows) {
    const occupied = new Set(
      vehicles
        .filter((o) => o.id !== v.id)
        .flatMap(cells)
        .map((p) => p.join(",")),
    );
    const [dx, dy] = DIRS[v.dir];
    let x = v.x + (v.dir === 0 ? v.len - 1 : 0),
      y = v.y + (v.dir === 1 ? v.len - 1 : 0),
      steps = 0;
    while (true) {
      x += dx;
      y += dy;
      if (x < 0 || y < 0 || x >= cols || y >= rows) return { clear: true, steps };
      if (occupied.has(`${x},${y}`)) return { clear: false, steps };
      steps++;
    }
  }
  function solve(level) {
    const vehicles = clone(level.vehicles),
      order = [];
    while (vehicles.length) {
      const i = vehicles.findIndex((v) => path(v, vehicles, level.cols, level.rows).clear);
      if (i < 0) return { solvable: false, order };
      order.push(vehicles[i].id);
      vehicles.splice(i, 1);
    }
    return { solvable: true, order };
  }
  function generate(n, salt = 0, specs = null) {
    n = Math.max(1, Math.min(Number.MAX_SAFE_INTEGER - 1, Math.floor(n) || 1));
    const seed =
      (Math.imul(n >>> 0, 2654435761) ^
        Math.imul(Math.floor(n / 4294967296), 2246822519) ^
        Math.imul(salt, 3266489917)) >>>
      0;
    const random = rng(seed),
      cols = Math.min(9, 7 + Math.floor(n / 12)),
      rows = Math.min(9, 7 + Math.floor(n / 9));
    const target = specs ? specs.length : Math.min(27, 11 + Math.floor(n * 0.7) + (n % 10 === 0 ? 3 : 0));
    const palette = Math.min(6, 3 + Math.floor(n / 4));
    const vehicles = [],
      occupied = new Set();
    const attributes =
      specs ||
      Array.from({ length: target }, (_, id) => ({
        id,
        len: random() < Math.min(0.3, 0.08 + n * 0.008) ? 3 : 2,
        color: Math.floor(random() * palette),
      }));
    for (const a of attributes) {
      const candidates = [];
      for (let dir = 0; dir < 4; dir++)
        for (let x = 0; x < cols; x++)
          for (let y = 0; y < rows; y++) {
            const v = { ...a, x, y, dir, capacity: a.capacity || (a.len === 3 ? 6 : 4), loaded: a.loaded || 0 };
            const cc = cells(v);
            if (cc.some(([cx, cy]) => cx >= cols || cy >= rows || occupied.has(`${cx},${cy}`))) continue;
            if (path(v, vehicles, cols, rows).clear) candidates.push(v);
          }
      if (!candidates.length) {
        // A sparse deterministic row layout is a constructive fallback for a reshuffle.
        if (specs) return fallback(n, cols, rows, attributes, seed);
        break;
      }
      const v = candidates[Math.floor(random() * candidates.length)];
      vehicles.push(v);
      cells(v).forEach((p) => occupied.add(p.join(",")));
    }
    const level = { n, seed, cols, rows, vehicles, par: vehicles.length };
    level.order = vehicles.map((v) => v.id).reverse();
    level.queue = level.order.flatMap((id) => {
      const v = vehicles.find((v) => v.id === id);
      return Array(v.capacity - v.loaded).fill(v.color);
    });
    return level;
  }
  function fallback(n, cols, rows, specs, seed) {
    const vehicles = [],
      bins = Array.from({ length: rows }, () => 0);
    for (const a of [...specs].sort((a, b) => b.len - a.len)) {
      const y = bins.findIndex((x) => x + a.len <= cols);
      if (y < 0) throw new Error("车辆容量超出棋盘");
      vehicles.push({
        ...a,
        x: bins[y],
        y,
        dir: 0,
        capacity: a.capacity || (a.len === 3 ? 6 : 4),
        loaded: a.loaded || 0,
      });
      bins[y] += a.len;
    }
    const level = { n, cols, rows, vehicles, seed, par: vehicles.length };
    level.order = solve(level).order;
    level.queue = level.order.flatMap((id) => {
      const v = vehicles.find((v) => v.id === id);
      return Array(v.capacity - v.loaded).fill(v.color);
    });
    return level;
  }
  function create(n) {
    const l = generate(n);
    return {
      ...l,
      total: l.queue.length,
      initialCars: l.vehicles.length,
      slots: Array(4).fill(null),
      moves: 0,
      used: 0,
      delivered: 0,
      cleared: 0,
      salt: 0,
      won: false,
    };
  }
  function board(state) {
    const departed = [];
    while (state.queue.length) {
      const i = state.slots.findIndex((v) => v && v.color === state.queue[0] && v.loaded < v.capacity);
      if (i < 0) break;
      const v = state.slots[i];
      state.queue.shift();
      v.loaded++;
      state.delivered++;
      if (v.loaded === v.capacity) {
        departed.push({ ...v, slot: i });
        state.slots[i] = null;
        state.cleared++;
      }
    }
    state.won = !state.vehicles.length && state.slots.every((v) => !v) && !state.queue.length;
    return departed;
  }
  function nextPassenger(state, excludedIds = new Set()) {
    if (!state.queue.length) return null;
    const slot = state.slots.findIndex(
      (v) => v && !excludedIds.has(v.id) && v.color === state.queue[0] && v.loaded < v.capacity,
    );
    return slot < 0 ? null : { slot, color: state.queue[0], id: state.slots[slot].id };
  }
  function loadPassenger(state, passenger = nextPassenger(state)) {
    if (!passenger) return null;
    const vehicle = state.slots[passenger.slot];
    if (
      !vehicle ||
      vehicle.id !== passenger.id ||
      vehicle.color !== state.queue[0] ||
      vehicle.loaded >= vehicle.capacity
    )
      return null;
    state.queue.shift();
    state.slots[passenger.slot].loaded++;
    state.delivered++;
    return passenger;
  }
  function releaseFull(state, slot) {
    const v = state.slots[slot];
    if (!v || v.loaded !== v.capacity) return null;
    state.slots[slot] = null;
    state.cleared++;
    state.won = !state.vehicles.length && state.slots.every((v) => !v) && !state.queue.length;
    return { ...v, slot };
  }
  function move(state, id, options = {}) {
    const v = state.vehicles.find((v) => v.id === id);
    if (!v) return { type: "none" };
    const p = path(v, state.vehicles, state.cols, state.rows);
    if (p.clear && state.slots.every(Boolean)) return { type: "full" };
    state.moves++;
    const before = clone(v);
    if (!p.clear) {
      v.x += DIRS[v.dir][0] * p.steps;
      v.y += DIRS[v.dir][1] * p.steps;
      return { type: "blocked", before, after: clone(v), steps: p.steps };
    }
    const slot = state.slots.indexOf(null);
    state.vehicles = state.vehicles.filter((v) => v.id !== id);
    state.slots[slot] = v;
    return { type: "exit", before, slot, departed: options.deferBoarding ? [] : board(state) };
  }
  function sortQueue(state, options = {}) {
    const waiting = state.slots.find(Boolean);
    const target = waiting || state.vehicles.find((v) => path(v, state.vehicles, state.cols, state.rows).clear);
    if (!target) return false;
    const needed = target.capacity - target.loaded;
    let taken = 0;
    const rest = [];
    for (const color of state.queue) {
      if (color === target.color && taken < needed) taken++;
      else rest.push(color);
    }
    state.queue = [...Array(taken).fill(target.color), ...rest];
    return { target: target.id, departed: options.deferBoarding ? [] : board(state) };
  }
  function remove(state, id, options = {}) {
    const v = state.vehicles.find((v) => v.id === id) || state.slots.find((v) => v && v.id === id);
    if (!v) return false;
    let remain = v.capacity - v.loaded;
    state.queue = state.queue.filter((color) => {
      if (color === v.color && remain > 0) {
        remain--;
        state.delivered++;
        return false;
      }
      return true;
    });
    state.vehicles = state.vehicles.filter((o) => o.id !== id);
    state.slots = state.slots.map((o) => (o && o.id === id ? null : o));
    state.cleared++;
    state.won = !state.vehicles.length && state.slots.every((v) => !v) && !state.queue.length;
    return { departed: options.deferBoarding ? [] : board(state) };
  }
  function shuffle(state, options = {}) {
    const l = generate(state.n, ++state.salt, state.vehicles);
    state.vehicles = l.vehicles;
    state.queue = [
      ...state.slots.filter(Boolean).flatMap((v) => Array(v.capacity - v.loaded).fill(v.color)),
      ...l.queue,
    ];
    return { departed: options.deferBoarding ? [] : board(state) };
  }
  function hint(state) {
    if (state.slots.every(Boolean)) return null;
    const available = state.vehicles.filter((v) => path(v, state.vehicles, state.cols, state.rows).clear);
    return (
      available.find((v) => v.color === state.queue[0]) ||
      available.find((v) => {
        const sim = clone(state);
        move(sim, v.id);
        return sim.slots.some((s) => s === null);
      }) ||
      null
    );
  }
  function stuck(state) {
    if (state.won) return false;
    if (state.slots.every(Boolean)) return true;
    return (
      state.vehicles.length > 0 &&
      state.vehicles.every((v) => {
        const p = path(v, state.vehicles, state.cols, state.rows);
        return !p.clear && !p.steps;
      })
    );
  }
  const api = {
    COLORS,
    DIRS,
    clone,
    rng,
    cells,
    path,
    solve,
    generate,
    create,
    board,
    nextPassenger,
    loadPassenger,
    releaseFull,
    move,
    sortQueue,
    remove,
    shuffle,
    hint,
    stuck,
  };
  if (typeof module !== "undefined") module.exports = api;
  root.ParkingEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
