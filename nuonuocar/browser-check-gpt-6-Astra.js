async (page) => {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  await page.evaluate(() => localStorage.removeItem("nuonuocar_gpt-6-Astra_v1"));
  // Navigate to a fresh document before clearing: pagehide persists the previous game.
  await page.goto("about:blank");
  await page.goto("http://localhost:8876/nuonuocar/index-gpt-6-Astra.html?debug=1");
  await page.evaluate(() => {
    parkingDebug.save.coins = 200;
    parkingDebug.save.props = { hint: 3, shuffle: 1, remove: 2, sort: 2, flip: 2 };
    parkingDebug.save.stars = {};
    parkingDebug.persist();
  });
  await page.goto("http://localhost:8876/nuonuocar/index-gpt-6-Astra.html?debug=1&level=3");
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.waitForFunction(() => window.parkingDebug?.renderer.hitAreas.length > 0);
  const read = () =>
    page.evaluate(() => ({
      state: parkingDebug.engine.clone(parkingDebug.state),
      save: parkingDebug.engine.clone(parkingDebug.save),
      history: parkingDebug.history.length,
    }));
  const clickCar = async (id) => {
    const point = await page.evaluate((id) => {
      const r = parkingDebug.renderer,
        v = parkingDebug.state.vehicles.find((v) => v.id === id);
      const x = v.x + (v.dir % 2 === 0 ? v.len / 2 : 0.5),
        y = v.y + (v.dir % 2 ? v.len / 2 : 0.5);
      const p = r.project(x, y, r.roofHeight());
      const rect = document.querySelector("#board").getBoundingClientRect();
      return { x: rect.x + p[0], y: rect.y + p[1], hit: r.hit(...p) };
    }, id);
    assert(point.hit === id, `car hit testing failed: ${id}/${point.hit}`);
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(() => !parkingDebug.busy);
  };
  let before = await read();
  const safeId = before.state.order[0];
  await clickCar(safeId);
  let after = await read();
  assert(after.state.vehicles.length === before.state.vehicles.length - 1, "touch exit");
  assert(after.state.delivered > 0, "same color passengers boarded");
  await page.getByRole("button", { name: "撤销上次操作" }).click();
  assert((await read()).state.delivered === before.state.delivered, "undo passengers");
  await page.locator('[data-prop="flip"]').click();
  await page.locator("#cancel-mode").click();
  assert((await read()).save.props.flip === before.save.props.flip, "cancel consumed flip");
  await page.locator('[data-prop="flip"]').click();
  await clickCar(safeId);
  after = await read();
  assert(after.save.props.flip === before.save.props.flip - 1, "flip consumption");
  assert(
    after.state.vehicles.find((v) => v.id === safeId).dir ===
      (before.state.vehicles.find((v) => v.id === safeId).dir + 2) % 4,
    "flip direction",
  );
  await page.keyboard.press("Escape");
  await page.locator("#undo").click();
  assert((await read()).save.props.flip === before.save.props.flip - 1, "undo refunded prop");
  await page.locator('[data-prop="hint"]').click();
  assert(await page.evaluate(() => parkingDebug.renderer.highlight !== null), "hint highlight");
  await page.locator('[data-prop="remove"]').click();
  await clickCar(safeId);
  after = await read();
  assert(after.save.props.remove === before.save.props.remove - 1, "remove consumption");
  assert(!after.state.vehicles.some((v) => v.id === safeId), "remove vehicle");
  await page.locator('[data-prop="sort"]').click();
  await page.waitForFunction(() => !parkingDebug.busy);
  assert((await read()).save.props.sort === before.save.props.sort - 1, "sort consumption");
  await page.locator('[data-prop="shuffle"]').click();
  await page.locator("#confirm-action").click();
  await page.waitForFunction(() => !parkingDebug.busy);
  after = await read();
  assert(after.save.props.shuffle === before.save.props.shuffle - 1, "shuffle consumption");
  assert(await page.evaluate(() => parkingDebug.engine.solve(parkingDebug.state).solvable), "shuffle solvability");
  const persisted = JSON.stringify(after.state);
  await page.reload();
  assert(JSON.stringify((await read()).state) === persisted, "active save reload");
  await page.locator("#expand").click();
  await page.locator("#confirm-action").click();
  assert((await read()).state.slots.length === 5, "extra slot");
  // Full-slot deadlock is intentionally constructed to exercise the UI recovery.
  await page.evaluate(() => {
    const d = parkingDebug,
      s = d.state;
    s.vehicles = [{ id: 999, x: 0, y: 0, len: 2, dir: 0, color: 0, capacity: 4, loaded: 0 }];
    s.slots = Array.from({ length: 4 }, (_, i) => ({ id: 100 + i, color: 1, len: 2, capacity: 4, loaded: 0, dir: 0 }));
    s.queue = [...Array(4).fill(0), ...Array(16).fill(1)];
    s.total = 20;
    s.delivered = 0;
    s.cleared = 0;
    s.won = false;
    d.check();
  });
  assert(await page.getByRole("heading", { name: "候车位有点挤" }).isVisible(), "full-slot modal");
  await page.locator("#rescue").click();
  await page.waitForFunction(() => !parkingDebug.busy);
  assert(
    (await read()).state.slots.some((v) => v === null),
    "sort rescues full slots",
  );
  await page.evaluate(() => parkingDebug.start(1));
  const won = await page.evaluate(async () => {
    const ids = [...parkingDebug.state.order];
    for (const id of ids) await parkingDebug.select(id);
    return { won: parkingDebug.state.won, coins: parkingDebug.save.coins, stars: parkingDebug.save.stars[1] };
  });
  assert(won.won && won.stars === 3, "full level win and stars");
  assert(await page.locator("#next").isVisible(), "next level action");
  await page.reload();
  assert((await read()).save.coins === won.coins, "reward duplicated on reload");
  await page.locator("#next").click();
  assert((await read()).state.n === 2, "next infinite level");
  await page.locator("#wallet").click();
  const coins = (await read()).save.coins;
  await page.locator('[data-buy="hint"]').click();
  assert(
    await page.evaluate(
      () =>
        Number(getComputedStyle(document.querySelector("#toast")).zIndex) >
        Number(getComputedStyle(document.querySelector("#overlay")).zIndex),
    ),
    "purchase feedback obscured by shop dialog",
  );
  assert((await read()).save.coins === coins - 30, "shop debit");
  await page.evaluate(() => {
    parkingDebug.save.coins = 0;
  });
  const props = (await read()).save.props.remove;
  await page.locator('[data-buy="remove"]').click();
  assert((await read()).save.props.remove === props, "insufficient coins");
  await page.locator("#shop-back").click();
  for (const size of [
    { width: 320, height: 667 },
    { width: 390, height: 844 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(size);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "horizontal overflow");
    const box = await page.locator(".props").boundingBox();
    assert(box.y + box.height <= size.height, "props clipped at " + JSON.stringify(size));
  }
  assert(errors.length === 0, errors.join("\n"));
  await page.evaluate(() => {
    parkingDebug.save.coins = 200;
    parkingDebug.save.props = { hint: 3, shuffle: 1, remove: 2, sort: 2, flip: 2 };
    parkingDebug.save.stars = {};
    parkingDebug.save.level = 1;
    parkingDebug.start(1);
  });
  await page.goto("http://localhost:8876/nuonuocar/index-gpt-6-Astra.html");
  return "PASS: mobile canvas click, boarding, undo, five props, cancellation, persisted game, slot expansion, full-slot rescue, victory, reward idempotency, next level, purchases, insufficient coins, three viewports; zero JS errors.";
};
