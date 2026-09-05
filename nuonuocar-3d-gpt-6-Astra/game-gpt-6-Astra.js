(function () {
  "use strict";
  const E = window.ParkingEngine,
    $ = (id) => document.getElementById(id);
  const KEY = "nuonuocar_3d_gpt-6-Astra_v1";
  const PROPS = {
    hint: { name: "提示", price: 30, desc: "找到一辆合适出发的小车" },
    shuffle: { name: "刷新", price: 60, desc: "重排车辆和队列，重新打通出路" },
    remove: { name: "消除", price: 80, desc: "直接接走一辆车对应的乘客" },
    sort: { name: "排序", price: 40, desc: "让候车位同色乘客优先上车" },
    flip: { name: "翻转", price: 30, desc: "将一辆车的箭头掉转方向" },
  };
  const fresh = () => ({
    version: 1,
    level: 1,
    coins: 200,
    props: { hint: 3, shuffle: 1, remove: 2, sort: 2, flip: 2 },
    stars: {},
    sound: true,
    active: null,
  });
  let storageOK = true;
  function read() {
    try {
      const a = JSON.parse(localStorage.getItem(KEY));
      if (!a || a.version !== 1) return fresh();
      if (
        !Number.isSafeInteger(a.level) ||
        a.level < 1 ||
        !Number.isFinite(a.coins) ||
        a.coins < 0 ||
        !a.props ||
        Object.keys(PROPS).some((k) => !Number.isInteger(a.props[k]) || a.props[k] < 0)
      )
        return fresh();
      return { ...fresh(), ...a };
    } catch {
      return fresh();
    }
  }
  let save = read();
  const params = new URLSearchParams(location.search),
    requested = Number(params.get("level"));
  const validRequested = Number.isSafeInteger(requested) && requested > 0 && requested < Number.MAX_SAFE_INTEGER;
  function validState(s) {
    if (
      !s ||
      !Array.isArray(s.vehicles) ||
      !Array.isArray(s.slots) ||
      !Array.isArray(s.queue) ||
      s.slots.length < 4 ||
      s.slots.length > 6 ||
      !Number.isSafeInteger(s.n) ||
      s.cols < 7 ||
      s.cols > 9 ||
      s.rows < 7 ||
      s.rows > 9
    )
      return false;
    const vs = [...s.vehicles, ...s.slots.filter(Boolean)];
    if (
      vs.length > 40 ||
      new Set(vs.map((v) => v.id)).size !== vs.length ||
      vs.some(
        (v) =>
          !Number.isInteger(v.dir) ||
          v.dir < 0 ||
          v.dir > 3 ||
          !Number.isInteger(v.color) ||
          v.color < 0 ||
          v.color >= 6 ||
          ![2, 3].includes(v.len) ||
          !Number.isInteger(v.loaded) ||
          v.loaded < 0 ||
          v.loaded > v.capacity,
      )
    )
      return false;
    return (
      s.queue.length === vs.reduce((sum, v) => sum + v.capacity - v.loaded, 0) &&
      s.total === s.queue.length + s.delivered
    );
  }
  let state =
    !validRequested && validState(save.active) ? save.active : E.create(validRequested ? requested : save.level);
  // A level link selects the starting level once; refreshing then resumes the active game.
  if (validRequested) {
    const url = new URL(location.href);
    url.searchParams.delete("level");
    try {
      window.history.replaceState(null, "", url);
    } catch {}
  }
  let mode = null,
    history = [],
    modalKind = null,
    toastTimer,
    highlightTimer,
    previousFocus;
  const renderer = new window.ParkingRenderer($("board"), () => state);
  const traffic = new window.ParkingTraffic(E, renderer, () => state, {
    changed() {
      persist();
      update();
    },
    settled() {
      update();
      check();
    },
    sound,
  });
  renderer.debug = params.get("debug") === "1";
  function persist() {
    save.active = E.clone(state);
    try {
      localStorage.setItem(KEY, JSON.stringify(save));
    } catch {
      if (storageOK) {
        storageOK = false;
        toast("浏览器无法保存进度，本次仍可正常游玩");
      }
    }
  }
  function toast(text) {
    $("toast").textContent = text;
    $("toast").classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $("toast").classList.remove("show"), 2600);
  }
  let audio;
  function sound(kind) {
    if (!save.sound) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      audio.resume();
      const t = audio.currentTime;
      const notes =
        kind === "win" ? [523, 659, 784, 1046] : kind === "exit" ? [440, 660] : kind === "blocked" ? [140, 105] : [550];
      notes.forEach((freq, i) => {
        const o = audio.createOscillator(),
          g = audio.createGain();
        o.type = kind === "blocked" ? "triangle" : "sine";
        o.frequency.setValueAtTime(freq, t + i * 0.09);
        g.gain.setValueAtTime(0, t + i * 0.09);
        g.gain.linearRampToValueAtTime(0.05, t + i * 0.09 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.15);
        o.connect(g);
        g.connect(audio.destination);
        o.start(t + i * 0.09);
        o.stop(t + i * 0.09 + 0.16);
      });
    } catch {}
  }
  function update() {
    $("level").textContent = state.n.toLocaleString("zh-CN");
    $("hard").hidden = state.n % 10 !== 0;
    $("coins").textContent = save.coins.toLocaleString("zh-CN");
    $("remaining").textContent = state.queue.length;
    $("cars-left").textContent = state.vehicles.length;
    const pct = state.total ? Math.round((state.delivered / state.total) * 100) : 100;
    $("percent").textContent = pct + "%";
    $("progress-fill").style.width = pct + "%";
    document.querySelectorAll("[data-prop]").forEach((b) => {
      const k = b.dataset.prop;
      b.querySelector(".prop-count").textContent = save.props[k] || "+";
      b.classList.toggle("empty", !save.props[k]);
      b.classList.toggle("selected", mode === k);
      b.setAttribute("aria-label", `${PROPS[k].name}，剩余 ${save.props[k]} 个`);
      b.setAttribute("aria-pressed", mode === k ? "true" : "false");
    });
    $("undo").disabled = history.length === 0 || traffic.busy || state.won;
    $("expand").disabled = state.slots.length >= 6;
    $("expand").innerHTML =
      state.slots.length >= 6
        ? "车位已全部开放"
        : `＋ 增加车位 <b>${60 + (state.slots.length - 4) * 40}</b><span class="coin small">✦</span>`;
    $("mode-banner").hidden = !mode;
    $("board-hint").style.visibility = mode ? "hidden" : "visible";
    if (mode)
      $("mode-banner").querySelector("span").textContent =
        mode === "flip" ? "选一辆小车，掉转方向" : "选一辆小车，专车接走乘客";
    renderer.mode = mode;
    renderer.updateStationStatus();
  }
  function setMode(value) {
    mode = value;
    update();
  }
  function snapshot() {
    history.push(E.clone(state));
    if (history.length > 60) history.shift();
  }
  function guard() {
    if (traffic.busy) {
      toast("小车正在出发，稍等一下");
      return false;
    }
    return !state.won;
  }
  function consume(k) {
    if (save.props[k] <= 0) return false;
    save.props[k]--;
    state.used++;
    sound("tap");
    return true;
  }
  function openModal(kind, html) {
    if ($("overlay").hidden) previousFocus = document.activeElement;
    modalKind = kind;
    setMode(null);
    $("modal-content").innerHTML = html;
    $("overlay").hidden = false;
    $("close-modal").hidden = kind === "win";
    setTimeout(() => $("modal-content").querySelector("button")?.focus(), 40);
  }
  function closeModal() {
    if (modalKind === "win") return;
    modalKind = null;
    $("overlay").hidden = true;
    previousFocus?.focus?.();
  }
  function forceClose() {
    modalKind = null;
    $("overlay").hidden = true;
  }
  const heading = (k, title) => `<div class="modal-kicker">${k}</div><h2 id="modal-title">${title}</h2>`;
  function confirm(title, description, action) {
    openModal(
      "confirm",
      `${heading("TAKE YOUR TIME", title)}<p>${description}</p><button class="primary" id="confirm-action">确认</button><button class="secondary" id="confirm-cancel">再想想</button>`,
    );
    $("confirm-action").onclick = () => {
      forceClose();
      action();
    };
    $("confirm-cancel").onclick = closeModal;
  }
  function help() {
    if (traffic.busy) return toast("乘客正在上车，稍等一下");
    openModal(
      "help",
      `${heading("A LITTLE GUIDE", "出发前，看这里")}<div class="help-step"><span>1</span><p><b>轻点小车，沿箭头出发</b><br>前方有车时会停下，先挪开挡路的车。</p></div><div class="help-step"><span>2</span><p><b>看队首颜色，再安排发车</b><br>乘客依次上同色车，满员自动离开。车顶符号也可以帮你辨认颜色。</p></div><div class="help-step"><span>3</span><p><b>留一个空位，别着急</b><br>只有 4 个候车位。堵住时用排序、刷新或消除，金币还能增加车位。</p></div><button class="primary" id="help-close">明白，出发！</button><p class="kbd">拖动旋转 · 双指或滚轮缩放 · 方向键选车，回车出发。</p>`,
    );
    $("help-close").onclick = closeModal;
  }
  function pause() {
    if (traffic.busy) return toast("等这辆小车停好就可以暂停");
    if (state.won) return;
    openModal(
      "pause",
      `${heading("TAKE A BREATHER", "休息一下")}<p>第 ${state.n} 关 · 已送达 ${state.delivered}/${state.total} 人<br>进度已自动保存，回来接着玩。</p><button class="primary" id="resume">继续游戏</button><button class="secondary" id="restart">重开本关</button><button class="secondary" id="sound">音效：${save.sound ? "开启" : "关闭"}</button><button class="secondary" id="pause-help">玩法说明</button><button class="text-button" id="reset">重置全部进度</button>`,
    );
    $("resume").onclick = closeModal;
    $("restart").onclick = () =>
      confirm("重新调度？", "本关重新开始，已消耗的道具和金币不会返还。", () => start(state.n));
    $("sound").onclick = () => {
      save.sound = !save.sound;
      persist();
      $("sound").textContent = "音效：" + (save.sound ? "开启" : "关闭");
      sound("tap");
    };
    $("pause-help").onclick = help;
    $("reset").onclick = () =>
      confirm("从第一关重新出发？", "这会清除当前关卡、金币、道具和星级记录。", () => {
        save = fresh();
        start(1);
      });
  }
  function shop(focus) {
    const rows = Object.entries(PROPS)
      .map(
        ([k, p]) =>
          `<div class="shop-row"><div class="shop-text"><b>${p.name} <small style="display:inline">× ${save.props[k]}</small></b><small>${p.desc}</small></div><button data-buy="${k}" aria-label="购买${p.name}，${p.price}金币">${p.price} ✦ ＋</button></div>`,
      )
      .join("");
    openModal(
      "shop",
      `${heading("A LITTLE HELP", "道具补给")}<p>现有 <b>${save.coins}</b> 金币 · 通关即可获得金币</p>${rows}<button class="primary" id="shop-back">回到停车场</button>`,
    );
    $("shop-back").onclick = closeModal;
    document.querySelectorAll("[data-buy]").forEach(
      (b) =>
        (b.onclick = () => {
          const k = b.dataset.buy;
          if (save.coins < PROPS[k].price) return toast("金币不足，通关可以获得金币");
          save.coins -= PROPS[k].price;
          save.props[k]++;
          persist();
          update();
          sound("tap");
          shop(k);
          toast(`${PROPS[k].name} +1`);
        }),
    );
    if (focus) setTimeout(() => document.querySelector(`[data-buy="${focus}"]`)?.focus(), 50);
  }
  function start(n) {
    clearTimeout(toastTimer);
    clearTimeout(highlightTimer);
    $("toast").classList.remove("show");
    state = E.create(n);
    history = [];
    traffic.reset();
    renderer.highlight = null;
    renderer.selected = null;
    forceClose();
    setMode(null);
    persist();
    update();
    const url = new URL(location.href);
    url.searchParams.delete("level");
    try {
      window.history.replaceState(null, "", url);
    } catch {}
  }
  function stars() {
    return state.used === 0 && state.moves <= state.par ? 3 : state.used <= 2 && state.moves <= state.par * 1.6 ? 2 : 1;
  }
  function totalReward(star) {
    return (20 + star * 10 + (star === 3 ? 20 : 0)) * (state.n % 10 === 0 ? 2 : 1);
  }
  function finish() {
    const star = stars(),
      best = save.stars[state.n] || 0,
      reward = Math.max(0, totalReward(star) - (best ? totalReward(best) : 0));
    save.coins += reward;
    save.stars[state.n] = Math.max(best, star);
    save.level = Math.max(save.level, state.n + 1);
    state.won = true;
    history = [];
    persist();
    update();
    sound("win");
    openModal(
      "win",
      `<div class="success">${heading("EVERYONE IS ON THEIR WAY", "这一站，圆满！")}<div class="stars">${"★".repeat(star)}<span style="color:#dce3d2">${"★".repeat(3 - star)}</span></div><p>拥堵清空，好心情全部送达。</p><div class="score-row"><span><b>${state.total}</b>乘客送达</span><span><b>${state.moves}</b>次调度</span><span><b>${state.used}</b>次道具</span></div><div class="reward">+${reward} <span class="coin">✦</span></div><p>${reward ? "金币已收入钱包" : "这一关的通关奖励已领取"}${star < 3 ? " · 少用道具和步数，试试三星" : ""}</p><button class="primary" id="next">出发，第 ${(state.n + 1).toLocaleString("zh-CN")} 关 →</button><button class="secondary" id="replay">再玩一次</button></div>`,
    );
    $("next").onclick = () => start(state.n + 1);
    $("replay").onclick = () => start(state.n);
    confetti();
  }
  function confetti() {
    if (renderer.reduce) return;
    const el = $("celebration");
    el.replaceChildren();
    for (let i = 0; i < 35; i++) {
      const d = document.createElement("i");
      d.className = "confetti";
      d.style.cssText = `left:${Math.random() * 100}%;background:${E.COLORS[i % 6].body};animation-delay:${Math.random() * 0.5}s;animation-duration:${1.4 + Math.random()}s;transform:rotate(${Math.random() * 180}deg)`;
      el.append(d);
    }
    setTimeout(() => el.replaceChildren(), 3200);
  }
  function check() {
    if (traffic.busy) return;
    if (state.won) {
      finish();
      return;
    }
    if (E.stuck(state)) {
      openModal(
        "stuck",
        `${heading("LET’S MAKE SOME ROOM", state.slots.every(Boolean) ? "候车位有点挤" : "换个方向试试")}<p>${state.slots.every(Boolean) ? "车位已满，队首乘客还在等同色车。排序可让已停好的车先接客离开。" : "小车互相挡住了。刷新会重新安排出车与接客顺序。"}</p><button class="primary" id="rescue">${state.slots.every(Boolean) ? "使用排序" : "使用刷新"}</button><button class="secondary" id="rescue-shop">去道具补给</button><button class="secondary" id="rescue-restart">重开本关</button><button class="text-button" id="rescue-back">回去看看 / 使用其他道具</button>`,
      );
      $("rescue").onclick = () => {
        forceClose();
        useProp(state.slots.every(Boolean) ? "sort" : "shuffle");
      };
      $("rescue-shop").onclick = () => shop();
      $("rescue-restart").onclick = () =>
        confirm("重新调度？", "重开本关，不返还已消耗的道具或金币。", () => start(state.n));
      $("rescue-back").onclick = closeModal;
    }
  }
  function resolveStation() {
    return traffic.service();
  }
  async function select(id) {
    if (!$("overlay").hidden || state.won || traffic.moving.has(id)) return;
    if (mode && traffic.busy) return toast("调度进行中，稍后再使用选车道具");
    if (id === null) {
      setMode(null);
      return;
    }
    const v = state.vehicles.find((v) => v.id === id) || state.slots.find((v) => v?.id === id);
    if (!v) return;
    if (mode === "remove") {
      if (!consume("remove")) return;
      history = [];
      E.remove(state, id, { deferBoarding: true });
      setMode(null);
      sound("exit");
      toast("专车已接走乘客");
      persist();
      update();
      await resolveStation();
      return;
    }
    if (mode === "flip") {
      if (!state.vehicles.includes(v)) return toast("候车位里的车辆不能翻转");
      snapshot();
      consume("flip");
      v.dir = (v.dir + 2) % 4;
      setMode(null);
      persist();
      update();
      check();
      return;
    }
    if (!state.vehicles.includes(v)) {
      toast(`${E.COLORS[v.color].name} · 已上车 ${v.loaded}/${v.capacity} 人`);
      return;
    }
    if (E.path(v, state.vehicles, state.cols, state.rows).clear && state.slots.every(Boolean)) {
      if (traffic.busy) toast("车位暂满，等一辆车驶离即可继续");
      else check();
      return;
    }
    snapshot();
    const result = E.move(state, id, { deferBoarding: true });
    renderer.highlight = null;
    sound(result.type);
    if (result.type === "blocked") toast("前面有车，先帮它腾个位置");
    await traffic.dispatch(result);
  }

  async function useProp(k) {
    if (!guard()) return;
    if (mode === k) {
      setMode(null);
      return;
    }
    if (!save.props[k]) {
      setMode(null);
      shop(k);
      return;
    }
    if (k === "remove" || k === "flip") {
      if (!state.vehicles.length && k === "flip") return toast("停车场已清空，试试乘客排序");
      setMode(k);
      return;
    }
    setMode(null);
    if (k === "hint") {
      const v = E.hint(state);
      if (!v) {
        toast(state.slots.some(Boolean) ? "试试「排序」，让候车位的小车先出发" : "试试「刷新」，重新安排出车顺序");
        return;
      }
      consume(k);
      renderer.highlight = v.id;
      clearTimeout(highlightTimer);
      highlightTimer = setTimeout(() => {
        renderer.highlight = null;
      }, 4200);
      toast(`让这辆${E.COLORS[v.color].name}小车先出发`);
    } else if (k === "sort") {
      const result = E.sortQueue(state, { deferBoarding: true });
      if (!result) return toast("暂时没有合适的车辆，试试刷新");
      consume(k);
      history = [];
      toast("同色乘客已优先安排");
    } else if (k === "shuffle") {
      confirm("重新排个队？", "消耗 1 次刷新，重排剩余小车和乘客队列，恢复一条可通关的路线。", async () => {
        consume(k);
        history = [];
        E.shuffle(state, { deferBoarding: true });
        persist();
        update();
        toast("道路通了，重新出发");
        await resolveStation();
      });
      return;
    }
    persist();
    update();
    if (k === "sort") {
      await resolveStation();
      return;
    }
    check();
  }
  renderer.onSelect = select;
  $("camera-reset").onclick = () => renderer.resetCamera();
  $("zoom-in").onclick = () => renderer.zoomBy(1.15);
  $("zoom-out").onclick = () => renderer.zoomBy(1 / 1.15);
  $("board").addEventListener("keydown", (e) => {
    const cars = state.vehicles;
    if (!cars.length) return;
    let i = cars.findIndex((v) => v.id === renderer.selected);
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
      i = (i + (["ArrowLeft", "ArrowUp"].includes(e.key) ? -1 : 1) + cars.length) % cars.length;
      renderer.selected = cars[i].id;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      select(cars[Math.max(i, 0)].id);
    }
  });
  $("cancel-mode").onclick = () => setMode(null);
  document.querySelectorAll("[data-prop]").forEach((b) => (b.onclick = () => useProp(b.dataset.prop)));
  $("undo").onclick = () => {
    if (!guard() || !history.length) return;
    const used = state.used;
    state = history.pop();
    traffic.reset();
    state.used = used;
    renderer.highlight = null;
    setMode(null);
    persist();
    update();
    sound("tap");
    toast("已撤回上次操作");
    traffic.service();
  };
  $("expand").onclick = () => {
    if (!guard() || state.slots.length >= 6) return;
    const price = 60 + (state.slots.length - 4) * 40;
    confirm("多留一个空位", `花费 ${price} 金币，本关增加一个候车位。`, () => {
      if (save.coins < price) return toast("金币不足，通关可以获得金币");
      save.coins -= price;
      state.slots.push(null);
      state.used++;
      history = [];
      persist();
      update();
      toast("新车位已开放");
    });
  };
  $("pause").onclick = pause;
  $("help").onclick = help;
  $("wallet").onclick = $("shop").onclick = () => {
    if (!traffic.busy && !state.won) shop();
  };
  $("close-modal").onclick = closeModal;
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!$("overlay").hidden) closeModal();
      else setMode(null);
    }
    if (e.key === "Tab" && !$("overlay").hidden) {
      const bs = [...$("overlay").querySelectorAll("button:not([hidden]):not(:disabled)")],
        first = bs[0],
        last = bs.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      persist();
      audio?.suspend();
    } else if (save.sound) audio?.resume();
  });
  window.addEventListener("pagehide", persist);
  update();
  persist();
  if (state.won) finish();
  else if (E.nextPassenger(state) || state.slots.some((v) => v && v.loaded === v.capacity)) resolveStation();
  if (renderer.debug) {
    window.parkingDebug = {
      get state() {
        return state;
      },
      get save() {
        return save;
      },
      engine: E,
      renderer,
      traffic,
      select,
      useProp,
      start,
      check,
      get busy() {
        return traffic.busy;
      },
      get history() {
        return history;
      },
      persist,
    };
    console.info("Parking debug: geometry solution", E.solve(state));
  }
})();
